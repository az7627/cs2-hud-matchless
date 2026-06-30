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

    def get_team_name(self, team):
        return self.team1_name if team == 1 else self.team2_name

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
            'votes': dict(self.votes),
            'team1_player_count': len(self.team1_players),
            'team2_player_count': len(self.team2_players),
            'team1_players': [{'name': p['name']} for p in self.team1_players],
            'team2_players': [{'name': p['name']} for p in self.team2_players],
        }

    def start_bp(self):
        """Begin the BP sequence."""
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

        action, team, count, side_picker = self.steps[self.step_index]
        self.current_acting = team
        self.current_action = action
        self.remaining_in_step = count
        self.side_picker = side_picker
        self.waiting_side_for = None
        self.votes = {}
        self.vote_active = False

        # Auto-start vote timer in team mode
        if self.entry_mode == 'team' and self.phase != 'complete':
            self.start_vote_timer()

    def execute_action(self, map_id, sid):
        """Called when a player/captain performs a ban or pick."""
        if self.phase == 'side_pick':
            # Handle side choice
            if self.waiting_side_for and map_id in ('ct', 't'):
                # map_id is actually 'ct' or 't' indicating side choice
                side_team = 1 if map_id == 'ct' else 2
                self._apply_side(side_team)
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
                return True

            # Move to next step
            self.step_index += 1
            self._load_step()
        else:
            # More maps to ban/pick in this step
            pass

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

    def _apply_side(self, side_team):
        """side_team = 1 for CT, 2 for T"""
        if not self.waiting_side_for:
            return
        map_id = self.waiting_side_for
        # Find the picked map entry
        for p in self.picked:
            if p['map_id'] == map_id:
                p['ct_team'] = side_team
                break
        picker = self.get_team_name(3 - self.current_acting)  # team that picked
        chooser = self.get_team_name(self.current_acting)     # team that chose side
        self.history.append({
            'action': 'side',
            'map_id': map_id,
            'team': side_team,
            'detail': f'{chooser} chose {side_team} as CT on {map_id} (picked by {picker})'
        })
        self.waiting_side_for = None
        self.phase = 'bp'

        # Move to next step
        if self.remaining_in_step <= 0:
            self.step_index += 1
            self._load_step()

    def side_choice(self, side_team, sid):
        """Handle side choice: side_team=1 means CT, 2 means T."""
        if self.phase != 'side_pick':
            return False
        team = self.current_acting
        if not self.can_act(sid, team):
            return False
        if self.waiting_side_for is None:
            return False

        if self.entry_mode == 'team' and self.vote_active:
            self.votes[sid] = {'map_id': 'ct' if side_team == 1 else 't', 'action': 'side', 'team': team}
            return True

        self._apply_side(side_team)
        return True

    def finalize_votes(self):
        """Called when vote timer expires — tally votes and execute."""
        if self.phase == 'bp' and self.current_action in ('ban', 'pick'):
            # Tally votes for ban/pick
            team_votes = {v for v in self.votes.values() if v['team'] == self.current_acting}
            if not team_votes:
                return
            # Count map_id occurrences
            counts = Counter(v['map_id'] for v in team_votes if v['action'] == self.current_action)
            if not counts:
                return
            max_count = max(counts.values())
            top = [m for m, c in counts.items() if c == max_count]
            chosen = random.choice(top)
            self._apply_action(chosen, self.current_acting)

        elif self.phase == 'side_pick':
            team_votes = {v for v in self.votes.values() if v['team'] == self.current_acting}
            if not team_votes:
                return
            from collections import Counter
            counts = Counter(v['map_id'] for v in team_votes if v['action'] == 'side')
            if not counts:
                return
            max_count = max(counts.values())
            top = [m for m, c in counts.items() if c == max_count]
            chosen = random.choice(top)  # 'ct' or 't'
            side_team = 1 if chosen == 'ct' else 2
            self._apply_side(side_team)

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
                if not self.vote_active:
                    return
                time.sleep(1)
            if self.vote_active:
                self.vote_active = False
                self.finalize_votes()

        self.vote_timer = threading.Thread(target=countdown, daemon=True)
        self.vote_timer.start()


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
        # Team mode — anyone can join
        if bp.phase != 'idle':
            emit('error', {'message': 'BP already in progress'})
            return
        if not player_name:
            emit('error', {'message': 'Name is required in team mode'})
            return
        # Check duplicate
        if any(p['sid'] == sid for p in players):
            emit('error', {'message': 'Already in team'})
            return
        players.append({'sid': sid, 'name': player_name})
        emit('team_entry_result', {'success': True, 'team': team, 'role': 'player', 'name': player_name})

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

    bp.reset()  # Reload config
    bp.start_bp()
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
    # Clean votes
    bp.votes.pop(sid, None)
    broadcast()

# ── Serve static frontend ───────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'RealtimeBP.html')

# ── Main ─────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import socketio as sio_module
    # Need request context for sid
    from flask import request
    print("═══ CS2 Real-time BP Server ═══")
    print(f"Config: {CONFIG_PATH}")
    print(f"BO{config['bo']} | Mode: {config['entry_mode']}")
    print(f"Teams: {config['teams']['team1']['name']} vs {config['teams']['team2']['name']}")
    print(f"Maps: {', '.join(config['map_pool'])}")
    print()
    print("Starting server at http://localhost:5000")
    print("Press Ctrl+C to stop.")
    print()
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
