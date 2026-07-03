#!/usr/bin/env python3
"""
Real-time BP Server — Flask-SocketIO backend for CS2 Ban & Pick.
Run: pip install flask flask-socketio eventlet  &&  python bp_server.py
"""

import json
import os
import hashlib
import random
import threading
import time
from collections import Counter
from flask import Flask, send_from_directory
from flask_socketio import SocketIO, emit

# ── Config ────────────────────────────────────────────────────────────────
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bp_config.json')

def make_salt():
    return os.urandom(16).hex()

def hash_password(password, salt):
    return hashlib.sha256((password + salt).encode()).hexdigest()

CONFIG_VERSION = 2

def make_default_config():
    s = make_salt()
    return {
        '_version': CONFIG_VERSION,
        'admin': {'password_hash': hash_password('admin', s), 'salt': s},
        'teams': {
            'team1': {'name': 'Team 1', 'password_hash': hash_password('team1', s), 'salt': s},
            'team2': {'name': 'Team 2', 'password_hash': hash_password('team2', s), 'salt': s},
        },
        'map_pool': ['de_dust2','de_mirage','de_inferno','de_anubis','de_overpass','de_nuke','de_ancient'],
        'bo': 3,
        'entry_mode': 'captain',
    }

def ensure_config():
    """Create default config if it doesn't exist or is outdated."""
    if not os.path.exists(CONFIG_PATH):
        save_config(make_default_config())
        print("✦ Created default config with passwords: admin / team1 / team2")
        print("  Change them with: python bp_admin.py")
        return
    # Check version
    try:
        with open(CONFIG_PATH) as f:
            existing = json.load(f)
        if existing.get('_version') != CONFIG_VERSION:
            # Merge existing settings into new defaults
            defaults = make_default_config()
            for key in ('admin', 'teams', 'map_pool', 'bo', 'entry_mode'):
                if key in existing:
                    defaults[key] = existing[key]
            defaults['_version'] = CONFIG_VERSION
            save_config(defaults)
            print("✦ Config upgraded to v" + str(CONFIG_VERSION))
    except Exception:
        save_config(make_default_config())
        print("✦ Config recreated (invalid file)")

def load_config():
    ensure_config()
    with open(CONFIG_PATH) as f:
        return json.load(f)

def save_config(cfg):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(cfg, f, indent=4)

# ── BP Step definitions ──────────────────────────────────────────────────
# Each entry: (action, acting_team, count, side_picker)
#   action: 'ban' | 'pick'
#   acting_team: 1 or 2
#   count: how many maps this step
#   side_picker: who picks CT/T for picked maps (0 = none for bans)
BO_STEPS = {
    1: [
        ('ban',  1, 2, 0),
        ('ban',  2, 3, 0),
        ('ban',  1, 1, 0),
    ],
    3: [
        ('ban',  1, 1, 0),
        ('ban',  2, 1, 0),
        ('pick', 1, 1, 2),
        ('pick', 2, 1, 1),
        ('ban',  1, 1, 0),
        ('ban',  2, 1, 0),
    ],
    5: [
        ('pick', 1, 1, 2),
        ('pick', 2, 1, 1),
        ('pick', 1, 1, 2),
        ('pick', 2, 1, 1),
        ('ban',  1, 1, 0),
        ('ban',  2, 1, 0),
    ],
}

# ── BP State Machine ─────────────────────────────────────────────────────
class BPState:
    def __init__(self):
        self.reset()

    def reset(self):
        cfg = load_config()
        self.bo = cfg['bo']
        self.entry_mode = cfg['entry_mode']
        self.team1_name = cfg['teams']['team1']['name']
        self.team2_name = cfg['teams']['team2']['name']
        self.map_pool = list(cfg['map_pool'])
        self.available = list(self.map_pool)
        self.banned = []       # {map_id, by}
        self.picked = []       # {map_id, by, ct_team}
        self.steps = BO_STEPS[self.bo]
        self.step_index = 0
        self.phase = 'idle'    # idle | bp | side_pick | complete
        self.team1_players = []   # [{sid, name}]
        self.team2_players = []   # [{sid, name}]
        self.votes = {}           # {sid: {map_id, action, team}}
        self.vote_timer = None
        self.vote_remaining = 0
        self.vote_active = False
        self.history = []         # [{action, map_id, team, detail}]
        self.captain_sid = {1: None, 2: None}
        self.current_acting = 0   # 1 or 2
        self.current_action = ''  # ban | pick
        self.remaining_in_step = 0
        self.side_picker = 0
        self.waiting_side_for = None  # map_id waiting for side pick
        # Step order: [display_team_for_role_1, display_team_for_role_2]
        # Randomised in start_bp() so first-mover isn't always team 1.
        self._acting_order = [1, 2]
        # Captain-ready start flow
        self.ready_phase = 'none'    # none | awaiting_start | waiting_confirm | ready_voting
        self.ready_initiator = 0
        self.ready_remaining = 0
        self.ready_confirmations = {}  # {sid: True/False/None} for team ready voting

    def get_team_name(self, team):
        return self.team1_name if team == 1 else self.team2_name

    def get_player_team(self, sid):
        """Return team (1|2) if sid is a registered player (any mode), else None."""
        for t, players in ((1, self.team1_players), (2, self.team2_players)):
            if any(p['sid'] == sid for p in players):
                return t
        return None

    def get_captain_team(self, sid):
        """Return team (1|2) if sid is a registered captain, else None."""
        for t in (1, 2):
            if self.captain_sid[t] == sid:
                return t
        return None

    def _get_player_name(self, sid):
        """Resolve a player's display name from their SID."""
        for p in self.team1_players + self.team2_players:
            if p['sid'] == sid:
                return p['name']
        return '?'

    def can_act(self, sid, team):
        """Check if a socket can perform actions for a team."""
        if self.entry_mode == 'captain':
            return self.captain_sid[team] == sid
        else:
            # In team mode, any player in the team can act
            players = self.team1_players if team == 1 else self.team2_players
            return any(p['sid'] == sid for p in players)

    def get_public_state(self):
        """Return state safe for all clients."""
        # Enrich votes with voter names
        enriched_votes = {}
        for sid, v in self.votes.items():
            enriched_votes[sid] = dict(v)
            enriched_votes[sid]['voter_name'] = self._get_player_name(sid)
        return {
            'phase': self.phase,
            'bo': self.bo,
            'entry_mode': self.entry_mode,
            'team1_name': self.team1_name,
            'team2_name': self.team2_name,
            'map_pool': self.map_pool,
            'available': list(self.available),
            'banned': list(self.banned),
            'picked': list(self.picked),
            'current_team': self.current_acting,
            'current_action': self.current_action,
            'remaining_in_step': self.remaining_in_step,
            'side_picker': self.side_picker,
            'waiting_side_for': self.waiting_side_for,
            'steps': self.steps,
            'step_index': self.step_index,
            'history': list(self.history),
            'vote_active': self.vote_active,
            'vote_remaining': self.vote_remaining,
            'votes': enriched_votes,
            'team1_player_count': len(self.team1_players),
            'team2_player_count': len(self.team2_players),
            'ready_phase': self.ready_phase,
            'ready_initiator': self.ready_initiator,
            'ready_remaining': self.ready_remaining,
            'ready_confirmations': dict(self.ready_confirmations),
            'team1_players': [{'name': p['name'], 'sid': p['sid']} for p in self.team1_players],
            'team2_players': [{'name': p['name'], 'sid': p['sid']} for p in self.team2_players],
        }

    def start_bp(self):
        """Begin the BP sequence — reloads config, preserves players, random first."""
        saved = {
            'team1_players': list(self.team1_players),
            'team2_players': list(self.team2_players),
            'captain_sid': dict(self.captain_sid),
        }
        self.reset()
        self.team1_players = saved['team1_players']
        self.team2_players = saved['team2_players']
        self.captain_sid = saved['captain_sid']
        # Randomise: _acting_order maps step-role (1=first, 2=second)
        # to display-team (1=left, 2=right).  Players' myTeam never changes.
        self._acting_order = [1, 2]
        if random.random() < 0.5:
            self._acting_order = [2, 1]
        self.phase = 'bp'
        self.step_index = 0
        self._load_step()

    def _load_step(self):
        if self.step_index >= len(self.steps):
            # All steps done
            if len(self.available) == 1:
                # Decider (Knife) — complete
                self.phase = 'complete'
                self.history.append({
                    'action': 'decider',
                    'map_id': self.available[0],
                    'team': 0,
                    'detail': f'{self.available[0]} — Decider'
                })
            return

        action, raw_team, count, raw_side = self.steps[self.step_index]
        # Map step roles (1=first, 2=second) to display teams via _acting_order
        self.current_acting = self._acting_order[raw_team - 1]
        self.current_action = action
        self.remaining_in_step = count
        self.side_picker = self._acting_order[raw_side - 1] if raw_side > 0 else 0
        self.waiting_side_for = None
        self.votes = {}
        self.vote_active = False

        # Auto-start vote timer in team mode
        if self.entry_mode == 'team' and self.phase != 'complete':
            self.start_vote_timer()

    def execute_action(self, map_id, sid):
        """Called when a player/captain performs a ban or pick."""
        if self.phase == 'side_pick':
            if self.waiting_side_for and map_id in ('ct', 't'):
                # map_id='ct' → my team plays CT; 't' → my team plays T
                choosing_team = self.current_acting
                ct_team = choosing_team if map_id == 'ct' else (3 - choosing_team)
                self._apply_side(ct_team)
                return True
            return False

        if self.phase != 'bp':
            return False

        team = self.current_acting
        if not self.can_act(sid, team):
            return False

        if map_id not in self.available:
            return False

        if self.entry_mode == 'team' and self.vote_active:
            # Record vote
            self.votes[sid] = {'map_id': map_id, 'action': self.current_action, 'team': team}
            return True

        # Captain mode — immediate action
        return self._apply_action(map_id, team)

    def _apply_action(self, map_id, team):
        action = self.current_action
        self.available.remove(map_id)

        if action == 'ban':
            self.banned.append({'map_id': map_id, 'by': team})
            self.history.append({
                'action': 'ban', 'map_id': map_id,
                'team': team,
                'detail': f'{self.get_team_name(team)} banned {map_id}'
            })
        elif action == 'pick':
            self.picked.append({'map_id': map_id, 'by': team, 'ct_team': None})
            self.history.append({
                'action': 'pick', 'map_id': map_id,
                'team': team,
                'detail': f'{self.get_team_name(team)} picked {map_id}'
            })

        self.remaining_in_step -= 1

        if self.remaining_in_step <= 0:
            # Check if next step needs side pick
            if action == 'pick' and self.side_picker > 0:
                # Enter side pick phase for this map
                self.phase = 'side_pick'
                self.waiting_side_for = map_id
                self.current_acting = self.side_picker
                self.current_action = 'side'
                # Start vote timer in team mode
                if self.entry_mode == 'team':
                    self.start_vote_timer()
                return True

            # Move to next step
            self.step_index += 1
            self._load_step()
        else:
            # More maps to ban/pick in this step — start new vote timer (team mode)
            if self.entry_mode == 'team':
                self.start_vote_timer()

        # Check if BP is complete
        if len(self.available) <= 1 and self.phase == 'bp':
            self.phase = 'complete'
            if len(self.available) == 1:
                self.history.append({
                    'action': 'decider',
                    'map_id': self.available[0],
                    'team': 0,
                    'detail': f'{self.available[0]} — Decider'
                })

        return True

    def _apply_side(self, ct_team):
        """ct_team: display team that plays CT (1 or 2)."""
        if not self.waiting_side_for:
            return
        map_id = self.waiting_side_for
        for p in self.picked:
            if p['map_id'] == map_id:
                p['ct_team'] = ct_team
                break
        ct_name = self.get_team_name(ct_team)
        t_name = self.get_team_name(3 - ct_team)
        chooser = self.get_team_name(self.current_acting)
        self.history.append({
            'action': 'side',
            'map_id': map_id,
            'team': ct_team,
            'detail': f'{chooser} chose {ct_name} CT / {t_name} T on {map_id}'
        })
        self.waiting_side_for = None
        self.phase = 'bp'

        # Move to next step
        if self.remaining_in_step <= 0:
            self.step_index += 1
            self._load_step()

    def side_choice(self, side_team, sid):
        """Handle side choice: side_team=1 → my team CT; 2 → my team T."""
        if self.phase != 'side_pick':
            return False
        team = self.current_acting
        if not self.can_act(sid, team):
            return False
        if self.waiting_side_for is None:
            return False

        # Convert symbolic (1=my-team-CT, 2=my-team-T) to actual ct_team
        ct_team = team if side_team == 1 else (3 - team)

        if self.entry_mode == 'team' and self.vote_active:
            self.votes[sid] = {'map_id': 'ct' if side_team == 1 else 't', 'action': 'side', 'team': team}
            return True

        self._apply_side(ct_team)
        return True

    def finalize_votes(self):
        """Called when vote timer expires — tally votes and execute."""
        if self.phase == 'bp' and self.current_action in ('ban', 'pick'):
            # Tally votes for ban/pick
            team_votes = [v for v in self.votes.values() if v['team'] == self.current_acting]
            if not team_votes or not any(v['action'] == self.current_action for v in team_votes):
                # No votes cast — random fallback to avoid BP deadlock
                avail = [m for m in self.available]
                if avail:
                    chosen = random.choice(avail)
                    self._apply_action(chosen, self.current_acting)
                else:
                    self.step_index += 1
                    self._load_step()
                self.votes = {}
                # vote_active already False from countdown; _apply_action may restart it
                return
            counts = Counter(v['map_id'] for v in team_votes if v['action'] == self.current_action)
            if not counts:
                self.votes = {}
                self.vote_active = False
                return
            max_count = max(counts.values())
            top = [m for m, c in counts.items() if c == max_count]
            chosen = random.choice(top)
            self._apply_action(chosen, self.current_acting)
            # Clear vote state only when BP is truly done (complete) or
            # we stayed in bp but no new timer was started.
            # Never clear if we transitioned to side_pick (new timer).
            if self.phase == 'complete' or (self.phase == 'bp' and not self.vote_active):
                self.votes = {}
                self.vote_active = False
            return

        if self.phase == 'side_pick':
            team_votes = [v for v in self.votes.values() if v['team'] == self.current_acting]
            if not team_votes or not any(v['action'] == 'side' for v in team_votes):
                # No votes — random fallback
                ct_team = random.choice([1, 2])
                self._apply_side(ct_team)
                return
            counts = Counter(v['map_id'] for v in team_votes if v['action'] == 'side')
            if not counts:
                self._apply_side(1)
                return
            max_count = max(counts.values())
            top = [m for m, c in counts.items() if c == max_count]
            chosen = random.choice(top)  # 'ct' or 't'
            choosing_team = self.current_acting
            ct_team = choosing_team if chosen == 'ct' else (3 - choosing_team)
            self._apply_side(ct_team)
            # _apply_side transitions to bp & may start new timer via _load_step
            return

        self.votes = {}
        self.vote_active = False

    def start_vote_timer(self):
        """Start a 10-second voting window (team mode only)."""
        if self.entry_mode != 'team':
            return
        self.votes = {}
        self.vote_active = True
        self.vote_remaining = 10

        def countdown():
            for i in range(10, 0, -1):
                self.vote_remaining = i
                broadcast()
                if not self.vote_active:
                    return
                socketio.sleep(1)
            if self.vote_active:
                self.vote_active = False
                self.finalize_votes()
                broadcast()  # Always push result after finalize

        socketio.start_background_task(countdown)


# ── Flask App ────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(16).hex()
socketio = SocketIO(app, cors_allowed_origins='*')

bp = BPState()
config = load_config()

# ── Helper: broadcast state to all ───────────────────────────────────────
def broadcast():
    socketio.emit('state_update', bp.get_public_state())

# ── Socket.IO Events ─────────────────────────────────────────────────────
@socketio.on('connect')
def on_connect():
    emit('sid', request.sid)
    emit('state_update', bp.get_public_state())

@socketio.on('admin_login')
def on_admin_login(data):
    pwd = data.get('password', '')
    expected = hash_password(pwd, config['admin']['salt'])
    if expected == config['admin']['password_hash']:
        emit('admin_login_result', {'success': True})
    else:
        emit('admin_login_result', {'success': False, 'error': 'Wrong password'})

@socketio.on('admin_update')
def on_admin_update(data):
    global config
    # Verify admin first
    pwd = data.get('password', '')
    expected = hash_password(pwd, config['admin']['salt'])
    if expected != config['admin']['password_hash']:
        emit('error', {'message': 'Admin auth failed'})
        return

    updates = data.get('updates', {})
    changed = False

    if 'map_pool' in updates:
        config['map_pool'] = updates['map_pool']
        changed = True
    if 'bo' in updates:
        config['bo'] = int(updates['bo'])
        changed = True
    if 'entry_mode' in updates:
        config['entry_mode'] = updates['entry_mode']
        changed = True
    if 'team1_name' in updates:
        config['teams']['team1']['name'] = updates['team1_name']
        changed = True
    if 'team2_name' in updates:
        config['teams']['team2']['name'] = updates['team2_name']
        changed = True
    if 'admin_password' in updates:
        new_pwd = updates['admin_password']
        salt = os.urandom(16).hex()
        config['admin']['salt'] = salt
        config['admin']['password_hash'] = hash_password(new_pwd, salt)
        changed = True
    if 'team1_password' in updates:
        new_pwd = updates['team1_password']
        salt = os.urandom(16).hex()
        config['teams']['team1']['salt'] = salt
        config['teams']['team1']['password_hash'] = hash_password(new_pwd, salt)
        changed = True
    if 'team2_password' in updates:
        new_pwd = updates['team2_password']
        salt = os.urandom(16).hex()
        config['teams']['team2']['salt'] = salt
        config['teams']['team2']['password_hash'] = hash_password(new_pwd, salt)
        changed = True

    if changed:
        save_config(config)
        emit('admin_update_result', {'success': True})
        broadcast()
    else:
        emit('admin_update_result', {'success': True, 'note': 'No changes'})

@socketio.on('enter_team')
def on_enter_team(data):
    team = data.get('team', 0)
    pwd = data.get('password', '')
    player_name = data.get('name', '').strip()

    if team not in (1, 2):
        emit('error', {'message': 'Invalid team'})
        return

    team_key = f'team{team}'
    expected = hash_password(pwd, config['teams'][team_key]['salt'])
    if expected != config['teams'][team_key]['password_hash']:
        emit('error', {'message': 'Wrong team password'})
        return

    players = bp.team1_players if team == 1 else bp.team2_players
    sid = request.sid

    if bp.entry_mode == 'captain':
        # Only captain allowed
        if bp.captain_sid[team] is not None and bp.captain_sid[team] != sid:
            emit('error', {'message': 'Captain already entered. Only one captain per team.'})
            return
        bp.captain_sid[team] = sid
        # Clean any existing entry for this sid
        players[:] = [p for p in players if p['sid'] != sid]
        players.append({'sid': sid, 'name': player_name or f'Captain {team}'})
        emit('team_entry_result', {'success': True, 'team': team, 'role': 'captain'})
    else:
        # Team mode — allow joining even during BP (players may reconnect)
        if not player_name:
            emit('error', {'message': 'Name is required in team mode'})
            return
        # Check duplicate
        if any(p['sid'] == sid for p in players):
            emit('error', {'message': 'Already in team'})
            return
        players.append({'sid': sid, 'name': player_name})
        emit('team_entry_result', {'success': True, 'team': team, 'role': 'player', 'name': player_name})
        # If ready voting is active, add newcomer to the confirmation pool
        if bp.ready_phase == 'ready_voting':
            bp.ready_confirmations[sid] = None

    # Check if both teams have at least one player -> ready to start
    if bp.phase == 'idle':
        if bp.entry_mode == 'captain' and bp.captain_sid[1] and bp.captain_sid[2]:
            bp.ready_phase = 'awaiting_start'
        elif bp.entry_mode == 'team' and len(bp.team1_players) > 0 and len(bp.team2_players) > 0:
            bp.ready_phase = 'awaiting_start'

    broadcast()

@socketio.on('spectate')
def on_spectate():
    emit('spectate_result', {'success': True})
    broadcast()

@socketio.on('start_bp')
def on_start_bp(data):
    pwd = data.get('password', '')
    expected = hash_password(pwd, config['admin']['salt'])
    if expected != config['admin']['password_hash']:
        emit('error', {'message': 'Admin auth failed'})
        return

    if bp.phase != 'idle':
        emit('error', {'message': 'BP already started'})
        return

    bp.start_bp()  # reloads config, preserves player state
    broadcast()

@socketio.on('action')
def on_action(data):
    map_id = data.get('map_id', '')
    sid = request.sid

    if bp.phase == 'side_pick':
        success = bp.side_choice(1 if map_id == 'ct' else 2, sid)
    else:
        success = bp.execute_action(map_id, sid)

    if success:
        if bp.entry_mode == 'team' and bp.vote_active:
            broadcast()  # Show updated votes
        else:
            broadcast()
    else:
        emit('error', {'message': 'Action not allowed'})

@socketio.on('reset_state')
def on_reset_state(data):
    pwd = data.get('password', '')
    expected = hash_password(pwd, config['admin']['salt'])
    if expected != config['admin']['password_hash']:
        emit('error', {'message': 'Admin auth failed'})
        return
    bp.reset()
    broadcast()

@socketio.on('request_start')
def on_request_start(data):
    """A player/captain requests to start the BP — prompts the other team to confirm."""
    sid = request.sid
    team = data.get('team', 0)

    if team not in (1, 2):
        emit('error', {'message': 'Invalid team'})
        return
    # Verify user belongs to the claimed team (captain mode or team mode)
    if bp.entry_mode == 'captain':
        if bp.captain_sid[team] != sid:
            emit('error', {'message': 'You are not the captain of this team'})
            return
    else:
        players = bp.team1_players if team == 1 else bp.team2_players
        if not any(p['sid'] == sid for p in players):
            emit('error', {'message': 'You are not on this team'})
            return
    if bp.ready_phase != 'awaiting_start':
        emit('error', {'message': 'Cannot request start right now'})
        return
    if bp.phase != 'idle':
        emit('error', {'message': 'BP already started'})
        return

    if bp.entry_mode == 'team':
        # ── Team mode: ready voting ──
        bp.ready_phase = 'ready_voting'
        bp.ready_initiator = team
        bp.ready_remaining = 30
        bp.ready_confirmations = {}
        for t in (1, 2):
            players = bp.team1_players if t == 1 else bp.team2_players
            for p in players:
                bp.ready_confirmations[p['sid']] = True if (t == team and p['sid'] == sid) else None
        broadcast()

        def r_countdown():
            for i in range(30, 0, -1):
                bp.ready_remaining = i
                if bp.ready_phase != 'ready_voting':
                    return
                broadcast()
                socketio.sleep(1)
            if bp.ready_phase == 'ready_voting':
                bp.ready_phase = 'awaiting_start'
                bp.ready_initiator = 0
                bp.ready_remaining = 0
                bp.ready_confirmations = {}
                broadcast()
        socketio.start_background_task(r_countdown)
        return

    # ── Captain mode: simple confirm flow ──
    bp.ready_phase = 'waiting_confirm'
    bp.ready_initiator = team
    bp.ready_remaining = 20
    broadcast()

    def c_countdown():
        for i in range(20, 0, -1):
            bp.ready_remaining = i
            if bp.ready_phase != 'waiting_confirm':
                return
            broadcast()
            socketio.sleep(1)
        if bp.ready_phase == 'waiting_confirm':
            bp.ready_phase = 'awaiting_start'
            bp.ready_initiator = 0
            bp.ready_remaining = 0
            broadcast()

    socketio.start_background_task(c_countdown)


@socketio.on('confirm_start')
def on_confirm_start(data):
    """Player/captain confirms (or cancels) the start request."""
    sid = request.sid
    confirm = data.get('confirm', False)

    # Resolve team from SID (captain mode or team mode)
    team = bp.get_captain_team(sid) or bp.get_player_team(sid)
    if not team:
        emit('error', {'message': 'You are not on a team'})
        return

    # ── Team mode: ready voting ──
    if bp.ready_phase == 'ready_voting':
        if sid not in bp.ready_confirmations:
            emit('error', {'message': 'You are not in the ready pool'})
            return
        if team == bp.ready_initiator:
            # Initiating team: player can toggle their confirmation
            bp.ready_confirmations[sid] = confirm
        else:
            # Other team: player can toggle their confirmation
            bp.ready_confirmations[sid] = confirm

        # Check if anyone explicitly cancelled
        if not confirm:
            # Anyone cancels → abort entirely
            bp.ready_phase = 'awaiting_start'
            bp.ready_initiator = 0
            bp.ready_remaining = 0
            bp.ready_confirmations = {}
            broadcast()
            return

        # Count confirmations per team — every connected player must accept
        t1_players = bp.team1_players if bp.ready_initiator == 1 else bp.team2_players
        t2_players = bp.team2_players if bp.ready_initiator == 1 else bp.team1_players
        init_ready = sum(1 for p in t1_players if bp.ready_confirmations.get(p['sid']) == True)
        other_ready = sum(1 for p in t2_players if bp.ready_confirmations.get(p['sid']) == True)
        init_total = len(t1_players)
        other_total = len(t2_players)

        # All players from both teams must accept
        if init_ready >= init_total and other_ready >= other_total:
            bp.ready_phase = 'none'
            bp.ready_initiator = 0
            bp.ready_remaining = 0
            bp.ready_confirmations = {}
            bp.start_bp()
        # else: not enough yet, just broadcast update

        broadcast()
        return

    # ── Captain mode: simple confirm flow ──
    if bp.ready_phase != 'waiting_confirm':
        emit('error', {'message': 'No pending start request'})
        return
    if team == bp.ready_initiator:
        # Initiator can cancel, but cannot confirm themselves
        if confirm:
            emit('error', {'message': 'Wait for the other captain to accept'})
            return
        # Cancel by initiator — abort
        bp.ready_phase = 'awaiting_start'
        bp.ready_initiator = 0
        bp.ready_remaining = 0
        broadcast()
        return

    if confirm:
        bp.ready_phase = 'none'
        bp.ready_initiator = 0
        bp.ready_remaining = 0
        bp.start_bp()
    else:
        bp.ready_phase = 'awaiting_start'
        bp.ready_initiator = 0
        bp.ready_remaining = 0

    broadcast()


@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    # Clean up player lists
    for team in (1, 2):
        players = bp.team1_players if team == 1 else bp.team2_players
        bp.team1_players = [p for p in bp.team1_players if p['sid'] != sid]
        bp.team2_players = [p for p in bp.team2_players if p['sid'] != sid]
        if bp.captain_sid[team] == sid:
            bp.captain_sid[team] = None
    # Clean votes and ready confirmations
    bp.votes.pop(sid, None)
    bp.ready_confirmations.pop(sid, None)
    # Reset ready state if a team can no longer act
    if bp.ready_phase != 'none':
        if (bp.entry_mode == 'captain' and (not bp.captain_sid[1] or not bp.captain_sid[2])) \
           or (bp.entry_mode == 'team' and (len(bp.team1_players) == 0 or len(bp.team2_players) == 0)):
            bp.ready_phase = 'none'
            bp.ready_initiator = 0
            bp.ready_remaining = 0
            bp.ready_confirmations = {}
    broadcast()

# ── Serve static frontend and map images ─────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'RealtimeBP.html')

@app.route('/res/<path:filename>')
def serve_res(filename):
    return send_from_directory(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'res'), filename)

# ── Main ─────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    from flask import request

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    # cert is at C:\Users\a233d\Documents\cert (two levels up from git\cs2-hud-matchless)
    CERT_DIR = os.path.join(os.path.dirname(os.path.dirname(BASE_DIR)), 'cert')
    cert_file = os.path.join(CERT_DIR, 'az7627.top.pem')
    key_file = os.path.join(CERT_DIR, 'az7627.top.key')

    print("═══ CS2 Real-time BP Server ═══")
    print(f"Config: {CONFIG_PATH}")
    print(f"BO{config['bo']} | Mode: {config['entry_mode']}")
    print(f"Teams: {config['teams']['team1']['name']} vs {config['teams']['team2']['name']}")
    print(f"Maps: {', '.join(config['map_pool'])}")
    print()
    if os.path.exists(cert_file) and os.path.exists(key_file):
        import eventlet
        import socket
        print(f"Starting HTTPS server at https://az7627.top:8443")
        print("Press Ctrl+C to stop.")
        print()
        # Dual-stack IPv4+IPv6 — create socket manually to bypass
        # getaddrinfo('::',…) which fails on some Windows configs.
        try:
            sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
            sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('', 8443))
            sock.listen(128)
            ssl_listener = eventlet.wrap_ssl(
                sock, certfile=cert_file, keyfile=key_file, server_side=True)
            print("Listening on [::]:8443 (dual-stack IPv4+IPv6)")
        except Exception as e:
            print(f"Dual-stack failed ({e}), IPv4 only")
            listener = eventlet.listen(('0.0.0.0', 8443))
            ssl_listener = eventlet.wrap_ssl(
                listener, certfile=cert_file, keyfile=key_file, server_side=True)
            print("Listening on 0.0.0.0:8443 (IPv4 only)")
        eventlet.wsgi.server(ssl_listener, app)
    else:
        print("Cert not found, starting HTTP at http://localhost:5000")
        print("Press Ctrl+C to stop.")
        print()
        socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
