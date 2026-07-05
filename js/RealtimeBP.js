const socket = io();

let state = null;
let myTeam = 0;
let myRole = '';
let mySid = '';
let myName = '';
let adminAuthed = false;
let isObserver = false;
let spectatorMode = false;
let renderedMaps = {};
let lastPhase = '';

const $ = id => document.getElementById(id);
const modal = $('modal');
const modalTitle = $('modalTitle');
const modalBody = $('modalBody');

function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.add('open');
}
function closeModal() {
    modal.classList.remove('open');
}
modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
});

function showNotification(msg) {
    openModal('Notice', `<p style="color:var(--text-secondary)">${msg}</p>
        <div class="modal-actions"><button class="modal-btn gray" onclick="closeModal()">OK</button></div>`);
}

socket.on('state_update', data => {
    state = data;
    render();
});

socket.on('bp_reset', () => {
    myTeam = 0;
    myRole = '';
    myName = '';
    render();
});

socket.on('error', data => {
    if (data && data.message) showNotification(data.message);
});

socket.on('admin_login_result', data => {
    if (data.success) {
        adminAuthed = true;
        closeModal();
        showAdminPanel();
    } else {
        showNotification('Wrong password');
    }
});

socket.on('admin_update_result', data => {
    if (data.success) { closeModal(); showNotification('Settings saved'); }
});

socket.on('team_entry_result', data => {
    if (data.success) {
        myTeam = data.team;
        myRole = data.role;
        myName = data.name || '';
        closeModal();
    } else {
        showNotification(data.error || 'Entry failed');
    }
});

socket.on('spectate_result', () => {
    isObserver = true;
    closeModal();
});

socket.on('sid', data => {
    mySid = data;
});

function render() {
    if (!state) return;

    if (lastPhase === 'idle' && state.phase === 'bp') {
        renderedMaps = {};
    }
    lastPhase = state.phase;

    $('team1Name').textContent = state.team1_name;
    $('team2Name').textContent = state.team2_name;
    $('boBadge').textContent = `BO${state.bo}`;

    const t1p = state.team1_players || [];
    const t2p = state.team2_players || [];
    $('team1Players').innerHTML = t1p.map(p =>
        `<span>${p.name}${myTeam === 1 && myName === p.name ? ' (You)' : ''}</span>`
    ).join('');
    $('team2Players').innerHTML = t2p.map(p =>
        `<span>${p.name}${myTeam === 2 && myName === p.name ? ' (You)' : ''}</span>`
    ).join('');

    const t1btn = $('team1Enter');
    const t2btn = $('team2Enter');
    t1btn.style.display = (myTeam === 1 || isObserver) ? 'none' : 'inline-block';
    t2btn.style.display = (myTeam === 2 || isObserver) ? 'none' : 'inline-block';

    if (myTeam === 1) {
        t1btn.style.display = 'inline-block';
        t1btn.textContent = state.entry_mode === 'captain' ? '✓ Captain' : '✓ You';
        t1btn.disabled = true;
    } else {
        t1btn.textContent = 'Enter Team';
        t1btn.disabled = false;
    }
    if (myTeam === 2) {
        t2btn.style.display = 'inline-block';
        t2btn.textContent = state.entry_mode === 'captain' ? '✓ Captain' : '✓ You';
        t2btn.disabled = true;
    } else {
        t2btn.textContent = 'Enter Team';
        t2btn.disabled = false;
    }

    const specBtn = $('spectateBtn');
    specBtn.style.display = 'inline-block';
    if (spectatorMode) {
        specBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Spectating';
        specBtn.classList.add('active');
    } else {
        specBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Spectate';
        specBtn.classList.remove('active');
    }

    const turnInfo = $('turnInfo');
    if (state.phase === 'idle') {
        turnInfo.textContent = 'Waiting for players...';
    } else if (state.phase === 'bp' || state.phase === 'side_pick') {
        const tn = state.current_team === 1 ? state.team1_name : state.team2_name;
        const tc = state.current_team === 1 ? 't1c' : 't2c';
        const action = state.current_action === 'ban' ? 'BAN' : state.current_action === 'pick' ? 'PICK' : 'CHOOSE SIDE';
        turnInfo.innerHTML = `<span class="${tc}">${tn}</span> to <span class="acting">${action}</span>${state.remaining_in_step > 1 ? ` (${state.remaining_in_step} left)` : ''}`;
    } else if (state.phase === 'complete') {
        turnInfo.innerHTML = '<i class="fa-solid fa-check"></i> BP Complete';
    }

    const panel = $('turnPanel');
    const isMyTurn = (myTeam === state.current_team && (state.phase === 'bp' || state.phase === 'side_pick'));
    const inBP = (state.phase === 'bp' || state.phase === 'side_pick');

    if (inBP && myTeam > 0) {
        if (isMyTurn) {
            panel.classList.add('active');
            if (state.vote_active && state.entry_mode === 'team') {
                $('cancelVoteBtn').style.display = 'none';
                if (state.phase === 'side_pick') {
                    $('turnPanelText').innerHTML = 'VOTE: <span style="color:var(--accent-green)">CHOOSE SIDE</span> <span style="color:var(--accent-gold)">' + state.vote_remaining + 's</span>';
                    const ctVoters = getSideVotersFor('ct');
                    const tVoters = getSideVotersFor('t');
                    const myVote = getMySideVote();
                    const ctExtra = ctVoters.length ? ' (' + ctVoters.map(function(v){return v.name}).join(',') + ')' : '';
                    const tExtra = tVoters.length ? ' (' + tVoters.map(function(v){return v.name}).join(',') + ')' : '';
                    const ctStyle = myVote === 'ct' ? ';box-shadow:0 0 0 2px var(--accent-gold)' : '';
                    const tStyle = myVote === 't' ? ';box-shadow:0 0 0 2px var(--accent-gold)' : '';
                    $('voteTimer').innerHTML =
                        '<div style="display:flex;align-items:center;gap:.6em">' +
                        '<button class="tag action ct" style="font-size:clamp(.65rem,.8vw,1rem);padding:.2em .7em;cursor:pointer' + ctStyle + '" id="voteSideCtBtn"><i class="fa-solid fa-circle" style="color:var(--t1-blue);font-size:.6em"></i> CT' + ctExtra + '</button>' +
                        '<button class="tag action t" style="font-size:clamp(.65rem,.8vw,1rem);padding:.2em .7em;cursor:pointer' + tStyle + '" id="voteSideTBtn"><i class="fa-solid fa-circle" style="color:var(--t2-orange);font-size:.6em"></i> T' + tExtra + '</button>' +
                        '</div>';
                    $('voteSideCtBtn').onclick = function(){ socket.emit('action', { map_id: 'ct' }); };
                    $('voteSideTBtn').onclick = function(){ socket.emit('action', { map_id: 't' }); };
                } else {
                    var al = state.current_action === 'ban' ? 'BAN' : 'PICK';
                    var need = state.remaining_in_step || 1;
                    var have = getMyVoteMaps().length;
                    var hint = need > 1 ? ' (' + have + '/' + need + ')' : '';
                    $('turnPanelText').innerHTML = 'VOTE: ' + al + hint;
                    $('voteTimer').textContent = state.vote_remaining + 's';
                }
            } else if (state.entry_mode === 'captain') {
                $('cancelVoteBtn').style.display = 'none';
                if (state.phase === 'side_pick') {
                    $('turnPanelText').innerHTML = 'Your turn to <span style="color:var(--accent-green)">CHOOSE SIDE</span>';
                    $('voteTimer').innerHTML =
                        '<button class="tag action ct" style="font-size:clamp(.65rem,.8vw,1rem);padding:.2em .7em;cursor:pointer" id="sideCtBtn"><i class="fa-solid fa-circle" style="color:var(--t1-blue);font-size:.6em"></i> CT</button>' +
                        '<button class="tag action t" style="font-size:clamp(.65rem,.8vw,1rem);padding:.2em .7em;cursor:pointer" id="sideTBtn"><i class="fa-solid fa-circle" style="color:var(--t2-orange);font-size:.6em"></i> T</button>';
                    $('sideCtBtn').onclick = function(){ socket.emit('action', { map_id: 'ct' }); };
                    $('sideTBtn').onclick = function(){ socket.emit('action', { map_id: 't' }); };
                } else {
                    var al2 = state.current_action === 'ban' ? 'BAN' : 'PICK';
                    $('turnPanelText').innerHTML = 'Your turn to <span style="color:var(--accent-green)">' + al2 + '</span>';
                    $('voteTimer').innerHTML = '';
                }
            } else {
                $('turnPanelText').textContent = 'Waiting for vote to start...';
                $('voteTimer').textContent = '';
                $('cancelVoteBtn').style.display = 'none';
            }
        } else {
            panel.classList.add('active');
            $('cancelVoteBtn').style.display = 'none';
            var tn = state.current_team === 1 ? state.team1_name : state.team2_name;
            var act = state.current_action === 'ban' ? 'BAN' : state.current_action === 'pick' ? 'PICK' : 'CHOOSE SIDE';
            $('turnPanelText').innerHTML = '<span>' + tn + '</span> is choosing: <span style="color:var(--accent-green)">' + act + '</span>';
            if (state.vote_active && state.vote_remaining > 0) {
                $('voteTimer').textContent = state.vote_remaining + 's';
            } else {
                $('voteTimer').textContent = '';
            }
        }
    } else {
        panel.classList.remove('active');
    }

    renderMaps();

    handleReadyState();
}

function renderMaps() {
    const area = $('mapsArea');
    if (!state) return;

    const pool = state.map_pool || [];

    const displayOrder = [];
    const seen = new Set();
    (state.history || []).forEach(h => {
        if (h.map_id && !seen.has(h.map_id)) {
            seen.add(h.map_id);
            displayOrder.push(h.map_id);
        }
    });
    pool.forEach(m => { if (!seen.has(m)) displayOrder.push(m); });

    area.innerHTML = displayOrder.map((mapId, idx) => {
        const mapName = mapId.replace('de_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const banned = state.banned.find(b => b.map_id === mapId);
        const picked = state.picked.find(p => p.map_id === mapId);
        const available = state.available.includes(mapId);
        const isDecider = state.phase === 'complete' && state.available.length === 1 && state.available[0] === mapId && !banned && !picked;

        if (spectatorMode && available && !banned && !picked && !isDecider) {
            return '';
        }

        let classes = 'map-card';
        if (banned) classes += ' banned';
        if (isDecider) classes += ' decider';

        const isClickable = canInteractWith(mapId);
        if (isClickable) {
            classes += ' clickable';
            classes += state.current_team === 1 ? ' t1-hover' : ' t2-hover';
        }
        const myMaps = getMyVoteMaps();
        if (myMaps.includes(mapId)) {
            classes += ' my-vote';
        }

        let tags = '';
        if (banned) {
            const teamName = banned.by === 1 ? state.team1_name : state.team2_name;
            const teamCls = banned.by === 1 ? 't1-bg' : 't2-bg';
            tags = '<span class="tag ' + teamCls + '">' + teamName + ' BANNED</span>';
        } else if (picked) {
            const pickerName = picked.by === 1 ? state.team1_name : state.team2_name;
            const pickerCls = picked.by === 1 ? 't1-bg' : 't2-bg';
            tags = '<span class="tag ' + pickerCls + '">' + pickerName + ' PICKED</span>';
            if (picked.ct_team) {
                const ctName = picked.ct_team === 1 ? state.team1_name : state.team2_name;
                const tName = picked.ct_team === 1 ? state.team2_name : state.team1_name;
                tags += '<span class="tag ct">' + ctName + ' CT</span>';
                tags += '<span class="tag t">' + tName + ' T</span>';
            }
        } else if (isDecider) {
            tags = '<span class="tag gold">DECIDER</span>';
        } else if (isClickable) {
            const actionText = state.current_action === 'ban' ? 'BAN' : 'PICK';
            const teamCls = state.current_team === 1 ? 't1-a' : 't2-a';
            tags = '<span class="tag action ' + teamCls + '" data-map="' + mapId + '">' + actionText + '</span>';
        } else {
            tags = '<span class="tag muted">Available</span>';
        }

        const voters = getVotersFor(mapId);
        if (voters.length > 0) {
            tags += '<span class="map-votes">' + voters.map(function(v) {
                const isMe = v.sid === mySid;
                const cls = isMe ? 'vote-name me' : 'vote-name';
                const tc = v.team === 1 ? 't1' : 't2';
                return '<span class="' + cls + ' ' + tc + '">' + v.name + '</span>';
            }).join('') + '</span>';
        }

        const isNew = !renderedMaps[mapId];
        if (isNew) renderedMaps[mapId] = true;
        const delay = (idx * 0.04).toFixed(2);
        const animStyle = (spectatorMode && isNew) ? 'animation:mapReveal .35s ease backwards;animation-delay:' + delay + 's' : '';
        return '<div class="' + classes + '" data-map="' + mapId + '" style="background-image:url(\'res/' + mapId + '.png\');' + animStyle + '">' +
            '<div class="map-left"><div><div class="map-name">' + mapName + '</div><div class="map-sub">' + mapId + '</div></div></div>' +
            '<div class="map-right">' + tags + '</div></div>';
    }).join('');

    area.querySelectorAll('.tag.action').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            const mapId = el.dataset.map;
            if (state.phase === 'side_pick') return;
            socket.emit('action', { map_id: mapId });
        });
    });

    area.querySelectorAll('.map-card.clickable').forEach(el => {
        el.addEventListener('click', () => {
            if (state.phase === 'side_pick') return;
            const mapId = el.dataset.map;
            if (state.current_action === 'ban' || state.current_action === 'pick') {
                socket.emit('action', { map_id: mapId });
            }
        });
    });
}

function canInteractWith(mapId) {
    if (!state) return false;
    if (myTeam <= 0) return false;
    if (state.phase !== 'bp') return false;
    if (myTeam !== state.current_team) return false;
    if (!state.available.includes(mapId)) return false;
    return true;
}

function getVotersFor(mapId) {
    if (!state || !state.votes) return [];
    return Object.entries(state.votes)
        .filter(([_, v]) => v.map_ids && v.map_ids.includes(mapId))
        .map(([sid, v]) => ({ sid, name: v.voter_name || '?', team: v.team }));
}

function getMyVoteMaps() {
    if (!state || !state.votes) return [];
    const v = state.votes[mySid];
    return v ? (v.map_ids || []) : [];
}

function getSideVotersFor(side) {
    if (!state || !state.votes || state.current_action !== 'side') return [];
    const team = state.current_team;
    return Object.entries(state.votes)
        .filter(([_, v]) => v.map_ids && v.map_ids.includes(side) && v.action === 'side' && v.team === team)
        .map(([sid, v]) => ({ sid, name: v.voter_name || '?', team: v.team }));
}

function getMySideVote() {
    if (!state || !state.votes) return null;
    const v = state.votes[mySid];
    if (!v || v.action !== 'side' || !v.map_ids) return null;
    return v.map_ids[0];
}

function canStart() {
    if (myTeam <= 0) return false;
    if (state.entry_mode === 'captain') return myRole === 'captain';
    return true;
}

function buildReadyVotingHTML() {
    const confirmations = state.ready_confirmations || {};
    const t1Name = state.team1_name;
    const t2Name = state.team2_name;
    const t1Total = state.team1_players.length;
    const t2Total = state.team2_players.length;

    function countReady(players) {
        return players.filter(p => confirmations[p.sid] === true).length;
    }

    function playerRow(p) {
        const status = confirmations[p.sid];
        const isMe = p.sid === mySid;
        let icon;
        if (status === true) icon = '<i class="fa-solid fa-check" style="font-size:.7em"></i>';
        else if (status === false) icon = '<i class="fa-solid fa-xmark" style="font-size:.7em"></i>';
        else icon = '<i class="fa-regular fa-circle" style="font-size:.7em"></i>';
        const cls = status === true ? 'rp-yes' : status === false ? 'rp-no' : 'rp-wait';
        const meTag = isMe ? ' (You)' : '';
        return `<div class="rp-row ${cls}">${icon} ${p.name}${meTag}</div>`;
    }

    return `
        <div class="ready-voting-wrap">
            <div class="rv-cols">
                <div class="rv-col">
                    <div class="rv-team-name">${t1Name} <span class="rv-count">${countReady(state.team1_players)}/${t1Total}</span></div>
                    ${state.team1_players.map(p => playerRow(p)).join('')}
                </div>
                <div class="rv-col">
                    <div class="rv-team-name">${t2Name} <span class="rv-count">${countReady(state.team2_players)}/${t2Total}</span></div>
                    ${state.team2_players.map(p => playerRow(p)).join('')}
                </div>
            </div>
            <div class="rv-footer">
                <span class="ready-timer">${state.ready_remaining}s</span>
                <div class="rv-actions">
                    <button class="modal-btn gold" id="rvYesBtn"><i class="fa-solid fa-check"></i> Ready</button>
                    <button class="modal-btn gray" id="rvNoBtn"><i class="fa-solid fa-xmark"></i> Not Ready</button>
                </div>
            </div>
        </div>
    `;
}

function handleReadyState() {
    const area = $('readyArea');
    if (!state || !area) return;

    if (state.phase !== 'idle') {
        area.classList.remove('show');
        area.innerHTML = '';
        return;
    }

    const curPhase = state.ready_phase;

    if (curPhase === 'awaiting_start') {
        area.classList.add('show');
        if (canStart()) {
            area.innerHTML = `<button class="start-btn" id="startBtn">START</button>`;
        } else {
            area.innerHTML = `<span class="ready-info">Both teams have players — waiting for start...</span>`;
        }
    } else if (curPhase === 'waiting_confirm') {
        const initTeam = state.ready_initiator;
        const initName = initTeam === 1 ? state.team1_name : state.team2_name;
        const otherTeam = initTeam === 1 ? 2 : 1;
        const otherName = otherTeam === 1 ? state.team1_name : state.team2_name;
        area.classList.add('show');

        if (myTeam > 0 && myTeam === initTeam && canStart()) {
            area.innerHTML = `
                <span class="ready-waiting-text">Waiting for ${otherName} to confirm…</span>
                <span class="ready-timer">${state.ready_remaining}s</span>
                <button class="start-btn cancel" id="cancelStartBtn">Cancel</button>
            `;
        } else if (myTeam > 0 && myTeam === otherTeam && canStart()) {
            area.innerHTML = `
                <div class="ready-confirm-box">
                    <div class="ready-confirm-text">${initName} wants to start! Are you ready?</div>
                    <span class="ready-timer">${state.ready_remaining}s</span>
                    <div class="ready-confirm-actions">
                        <button class="modal-btn gold" id="readyConfirmYes"><i class="fa-solid fa-check"></i> Ready</button>
                        <button class="modal-btn gray" id="readyConfirmNo"><i class="fa-solid fa-xmark"></i> Cancel</button>
                    </div>
                </div>
            `;
        } else {
            area.innerHTML = `<span class="ready-info">${initName} wants to start the BP… (${state.ready_remaining}s)</span>`;
        }
    } else if (curPhase === 'ready_voting') {
        area.classList.add('show');
        area.innerHTML = buildReadyVotingHTML();
    } else {
        area.classList.remove('show');
        area.innerHTML = '';
    }
}

(function() {
    const area = $('readyArea');
    if (!area) return;
    area.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.id === 'startBtn') socket.emit('request_start', { team: myTeam });
        else if (btn.id === 'cancelStartBtn') socket.emit('confirm_start', { confirm: false });
        else if (btn.id === 'readyConfirmYes') socket.emit('confirm_start', { confirm: true });
        else if (btn.id === 'readyConfirmNo') socket.emit('confirm_start', { confirm: false });
        else if (btn.id === 'rvYesBtn') socket.emit('confirm_start', { confirm: true });
        else if (btn.id === 'rvNoBtn') socket.emit('confirm_start', { confirm: false });
    });
})();

$('adminBtn').addEventListener('click', () => {
    if (adminAuthed) {
        showAdminPanel();
    } else {
        openModal('Admin Login', `
            <input class="modal-input" type="password" id="adminPwd" placeholder="Password" />
            <div class="modal-actions">
                <button class="modal-btn gold" id="adminLoginBtn">Login</button>
                <button class="modal-btn gray" onclick="closeModal()">Cancel</button>
            </div>
        `);
        setTimeout(() => $('adminPwd')?.focus(), 100);
        $('adminLoginBtn').addEventListener('click', () => {
            const pwd = $('adminPwd')?.value || '';
            socket.emit('admin_login', { password: pwd });
        });
        $('adminPwd')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') $('adminLoginBtn')?.click();
        });
    }
});

function showAdminPanel() {
    if (!state) return;
    openModal('Admin Panel', `
        <div style="text-align:left;font-size:clamp(.5rem,.65vw,.75rem)">
            <label style="color:var(--text-muted)">Map Pool (comma-separated IDs)</label>
            <input class="modal-input" id="admMapPool" value="${(state.map_pool || []).join(', ')}" />
            <label style="color:var(--text-muted)">BO</label>
            <input class="modal-input" id="admBo" value="${state.bo}" placeholder="1 / 3 / 5" />
            <label style="color:var(--text-muted)">Entry Mode</label>
            <input class="modal-input" id="admEntryMode" value="${state.entry_mode}" placeholder="captain / team" />
            <label style="color:var(--text-muted)">Team 1 Name</label>
            <input class="modal-input" id="admT1Name" value="${state.team1_name}" />
            <label style="color:var(--text-muted)">Team 2 Name</label>
            <input class="modal-input" id="admT2Name" value="${state.team2_name}" />
            <label style="color:var(--text-muted)">New Admin Password (leave blank to keep)</label>
            <input class="modal-input" type="password" id="admAdminPwd" placeholder="New admin password" />
            <label style="color:var(--text-muted)">New Team 1 Password (leave blank to keep)</label>
            <input class="modal-input" type="password" id="admT1Pwd" placeholder="New team 1 password" />
            <label style="color:var(--text-muted)">New Team 2 Password (leave blank to keep)</label>
            <input class="modal-input" type="password" id="admT2Pwd" placeholder="New team 2 password" />
        </div>
        <div class="modal-actions" style="margin-top:.8em">
            <button class="modal-btn gold" id="admSaveBtn">Save</button>
            <button class="modal-btn blue" id="admStartBtn">Start BP</button>
            <button class="modal-btn orange" id="admResetBtn">Reset</button>
            <button class="modal-btn gray" onclick="closeModal()">Close</button>
        </div>
    `);

    $('admSaveBtn').addEventListener('click', () => {
        const updates = {};
        const pool = ($('admMapPool')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
        if (pool.length) updates.map_pool = pool;
        const bo = parseInt($('admBo')?.value);
        if ([1,3,5].includes(bo)) updates.bo = bo;
        const mode = ($('admEntryMode')?.value || '').toLowerCase();
        if (['captain','team'].includes(mode)) updates.entry_mode = mode;
        const t1 = $('admT1Name')?.value?.trim();
        if (t1) updates.team1_name = t1;
        const t2 = $('admT2Name')?.value?.trim();
        if (t2) updates.team2_name = t2;
        const ap = $('admAdminPwd')?.value?.trim();
        if (ap) updates.admin_password = ap;
        const t1p = $('admT1Pwd')?.value?.trim();
        if (t1p) updates.team1_password = t1p;
        const t2p = $('admT2Pwd')?.value?.trim();
        if (t2p) updates.team2_password = t2p;

        openModal('Confirm Admin Password', `
            <input class="modal-input" type="password" id="admConfirmPwd" placeholder="Admin password" />
            <div class="modal-actions">
                <button class="modal-btn gold" id="admConfirmBtn">Confirm</button>
                <button class="modal-btn gray" onclick="closeModal()">Cancel</button>
            </div>
        `);
        $('admConfirmBtn').addEventListener('click', () => {
            const pwd = $('admConfirmPwd')?.value || '';
            socket.emit('admin_update', { password: pwd, updates });
            closeModal();
        });
    });

    $('admStartBtn').addEventListener('click', () => {
        openModal('Start BP', `
            <div style="color:var(--text-secondary);font-size:clamp(.55rem,.7vw,.8rem);margin-bottom:.5em">Enter admin password to start BP</div>
            <input class="modal-input" type="password" id="startPwd" placeholder="Admin password" />
            <div class="modal-actions">
                <button class="modal-btn gold" id="startConfirmBtn">Start</button>
                <button class="modal-btn gray" onclick="closeModal()">Cancel</button>
            </div>
        `);
        $('startConfirmBtn').addEventListener('click', () => {
            const pwd = $('startPwd')?.value || '';
            socket.emit('start_bp', { password: pwd });
            closeModal();
        });
    });

    $('admResetBtn').addEventListener('click', () => {
        openModal('Reset State', `
            <div style="color:var(--text-secondary);font-size:clamp(.55rem,.7vw,.8rem);margin-bottom:.5em">Enter admin password to reset</div>
            <input class="modal-input" type="password" id="resetPwd" placeholder="Admin password" />
            <div class="modal-actions">
                <button class="modal-btn gold" id="resetConfirmBtn">Reset</button>
                <button class="modal-btn gray" onclick="closeModal()">Cancel</button>
            </div>
        `);
        $('resetConfirmBtn').addEventListener('click', () => {
            const pwd = $('resetPwd')?.value || '';
            socket.emit('reset_state', { password: pwd });
            closeModal();
        });
    });
}

$('team1Enter').addEventListener('click', () => enterTeam(1));
$('team2Enter').addEventListener('click', () => enterTeam(2));

function enterTeam(team) {
    if (!state) {
        const wait = setInterval(() => {
            if (state) { clearInterval(wait); enterTeam(team); }
        }, 50);
        return;
    }
    const label = team === 1 ? state.team1_name : state.team2_name;
    const isTeamMode = state.entry_mode === 'team';

    if (isTeamMode) {
        openModal(`Enter ${label}`, `
            <div class="modal-hint">Enter your player name and team password</div>
            <input class="modal-input" id="enterName" placeholder="Your name" />
            <input class="modal-input" type="password" id="enterPwd" placeholder="Team password" />
            <div class="modal-actions">
                <button class="modal-btn ${team === 1 ? 'blue' : 'orange'}" id="enterConfirm">Enter</button>
                <button class="modal-btn gray" onclick="closeModal()">Cancel</button>
            </div>
        `);
        setTimeout(() => $('enterName')?.focus(), 100);
        $('enterConfirm').addEventListener('click', () => {
            const name = $('enterName')?.value?.trim() || '';
            const pwd = $('enterPwd')?.value || '';
            if (!name) { showNotification('Name is required'); return; }
            socket.emit('enter_team', { team, password: pwd, name });
        });
    } else {
        openModal(`Enter ${label} as Captain`, `
            <div class="modal-hint">Enter the team password to join as captain</div>
            <input class="modal-input" type="password" id="enterPwdC" placeholder="Team password" />
            <div class="modal-actions">
                <button class="modal-btn ${team === 1 ? 'blue' : 'orange'}" id="enterConfirmC">Enter</button>
                <button class="modal-btn gray" onclick="closeModal()">Cancel</button>
            </div>
        `);
        setTimeout(() => $('enterPwdC')?.focus(), 100);
        $('enterConfirmC').addEventListener('click', () => {
            const pwd = $('enterPwdC')?.value || '';
            socket.emit('enter_team', { team, password: pwd, name: `Captain ${label}` });
        });
    }
}

$('spectateBtn').addEventListener('click', () => {
    spectatorMode = !spectatorMode;
    render();
});

console.log('Realtime BP — CS2 HUD');
console.log('Connected to server:', socket.connected);
