(function() {
    'use strict';

    const MAPS = [
        { id: 'de_dust2',   name: 'Dust 2',  file: 'de_dust2.png' },
        { id: 'de_mirage',  name: 'Mirage',  file: 'de_mirage.png' },
        { id: 'de_inferno', name: 'Inferno', file: 'de_inferno.png' },
        { id: 'de_anubis',  name: 'Anubis',  file: 'de_anubis.png' },
        { id: 'de_overpass',name: 'Overpass',file: 'de_overpass.png' },
        { id: 'de_nuke',    name: 'Nuke',    file: 'de_nuke.png' },
        { id: 'de_ancient', name: 'Ancient', file: 'de_ancient.png' },
    ];
    const IMG_PATH = 'res/';

    const M = {};
    MAPS.forEach(m => { M[m.id] = { banned: null, picked: null, ctTeam: null }; });
    const timeline = [];

    const $ = id => document.getElementById(id);
    const mapsContainer = $('mapsContainer');
    const dialogOverlay = $('dialogOverlay');
    const dialogOptions = $('dialogOptions');
    const dialogCancel = $('dialogCancel');
    const playBtn = $('playBtn');
    const banCountEl = $('banCount');
    const pickCountEl = $('pickCount');
    const t1PickCountEl = $('t1PickCount');
    const t2PickCountEl = $('t2PickCount');
    const t1Input = $('team1-input');
    const t2Input = $('team2-input');

    function tn(team) { return (team === 1 ? t1Input : t2Input).value.trim() || (team === 1 ? 'Team 1' : 'Team 2'); }
    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    let dialogResolve = null;
    function openDialog(title, sub, opt1, opt2) {
        return new Promise(resolve => {
            $('dialogTitle').textContent = title;
            $('dialogSub').textContent = sub;
            const bs = dialogOptions.querySelectorAll('.dialog-opt-btn');
            bs[0].textContent = opt1.label;
            bs[0].dataset.result = JSON.stringify(opt1.result);
            bs[0].className = 'dialog-opt-btn ' + (opt1.cls || 't1-clr');
            bs[1].textContent = opt2.label;
            bs[1].dataset.result = JSON.stringify(opt2.result);
            bs[1].className = 'dialog-opt-btn ' + (opt2.cls || 't2-clr');
            dialogResolve = resolve;
            dialogOverlay.classList.add('open');
        });
    }
    dialogOptions.addEventListener('click', e => {
        const b = e.target.closest('.dialog-opt-btn');
        if (!b || !dialogResolve) return;
        dialogOverlay.classList.remove('open');
        const r = JSON.parse(b.dataset.result);
        const fn = dialogResolve; dialogResolve = null;
        fn(r);
    });
    dialogCancel.addEventListener('click', () => {
        if (!dialogResolve) return;
        dialogOverlay.classList.remove('open');
        const fn = dialogResolve; dialogResolve = null;
        fn(null);
    });

    function renderMaps() {
        mapsContainer.innerHTML = '';
        MAPS.forEach(m => {
            const row = document.createElement('div');
            row.className = 'map-row hidden-map';
            row.id = 'map-' + m.id;
            row.style.backgroundImage = `url(${IMG_PATH}${m.file})`;

            const c = document.createElement('div');
            c.className = 'map-content';

            const ns = document.createElement('div');
            ns.className = 'map-name-section';
            ns.innerHTML = `<div><div class="map-name">${m.name}</div><div class="map-subname">${m.id}</div></div>`;
            c.appendChild(ns);

            const right = document.createElement('div');
            right.className = 'map-right';
            const sd = document.createElement('div');
            sd.className = 'map-status';
            sd.id = 'status-' + m.id;
            right.appendChild(sd);
            const ad = document.createElement('div');
            ad.className = 'map-actions';
            ad.id = 'actions-' + m.id;
            right.appendChild(ad);
            c.appendChild(right);

            row.appendChild(c);
            mapsContainer.appendChild(row);
        });
        document.querySelectorAll('.map-row').forEach(r => r.classList.remove('hidden-map'));
        updateAll();
    }

    function updateMap(mapId) {
        const s = M[mapId];
        const row = $('map-' + mapId);
        const st = $('status-' + mapId);
        const ac = $('actions-' + mapId);
        if (!row || !st) return;

        st.innerHTML = '';
        row.className = 'map-row';
        ac.innerHTML = '';

        if (s.banned !== null) {
            row.classList.add('banned');
            const tag = document.createElement('span');
            tag.className = 'status-tag banned';
            tag.textContent = `${tn(s.banned)} BANNED`;
            st.appendChild(tag);
        } else if (s.picked !== null) {
            row.classList.add('picked');
            const pi = document.createElement('span');
            pi.className = 'status-tag picked-info';
            pi.textContent = `${tn(s.picked)} PICKED`;
            st.appendChild(pi);
            if (s.ctTeam !== null) {
                const ct = s.ctTeam;
                const t = ct === 1 ? 2 : 1;
                const ctTag = document.createElement('span');
                ctTag.className = 'status-tag side-ct';
                ctTag.textContent = `${tn(ct)} CT`;
                st.appendChild(ctTag);
                const tTag = document.createElement('span');
                tTag.className = 'status-tag side-t';
                tTag.textContent = `${tn(t)} T`;
                st.appendChild(tTag);
                const sb = document.createElement('button');
                sb.className = 'action-btn pick-btn';
                sb.innerHTML = '<i class="fa-solid fa-right-left"></i> CT';
                sb.style.fontSize = 'clamp(0.42rem, 0.5vw, 0.62rem)';
                sb.addEventListener('click', e => { e.stopPropagation(); doSide(mapId); });
                ac.appendChild(sb);
            } else {
                const sb = document.createElement('button');
                sb.className = 'action-btn pick-btn';
                sb.textContent = 'SET CT';
                sb.addEventListener('click', e => { e.stopPropagation(); doSide(mapId); });
                ac.appendChild(sb);
            }
        } else {
            const bb = document.createElement('button');
            bb.className = 'action-btn ban-btn';
            bb.textContent = 'BAN';
            bb.addEventListener('click', e => { e.stopPropagation(); doBan(mapId); });
            const pb = document.createElement('button');
            pb.className = 'action-btn pick-btn';
            pb.textContent = 'PICK';
            pb.addEventListener('click', e => { e.stopPropagation(); doPick(mapId); });
            ac.appendChild(bb);
            ac.appendChild(pb);
        }

        if (s.banned === null && s.picked === null) {
            const unmarked = MAPS.filter(m => M[m.id].banned === null && M[m.id].picked === null);
            const isDecider = isAnimating || (unmarked.length === 1 && unmarked[0].id === mapId);
            if (isDecider) {
                row.classList.add('decider');
                if (!st.querySelector('.decider-tag')) {
                    const dt = document.createElement('span');
                    dt.className = 'status-tag decider-tag';
                    dt.textContent = 'DECIDER';
                    st.appendChild(dt);
                }
                ac.innerHTML = '';
            }
        }
    }

    function updateAll() {
        MAPS.forEach(m => updateMap(m.id));
        updateStats();
    }

    function updateStats() {
        let bans = 0, picks = 0, t1p = 0, t2p = 0;
        MAPS.forEach(m => {
            const s = M[m.id];
            if (s.banned !== null) bans++;
            if (s.picked !== null) { picks++; s.picked === 1 ? t1p++ : t2p++; }
        });
        banCountEl.textContent = bans;
        pickCountEl.textContent = picks;
        t1PickCountEl.textContent = t1p;
        t2PickCountEl.textContent = t2p;
        playBtn.disabled = timeline.length === 0;
    }

    async function doBan(mapId) {
        const r = await openDialog(
            'BAN',
            `Which team bans ${MAPS.find(m => m.id === mapId).name}?`,
            { label: tn(1), result: { team: 1 }, cls: 't1-clr' },
            { label: tn(2), result: { team: 2 }, cls: 't2-clr' }
        );
        if (!r) return;
        M[mapId].banned = r.team;
        timeline.push({ mapId, action: 'ban', team: r.team });
        updateMap(mapId);
        updateStats();
    }

    async function doPick(mapId) {
        const r = await openDialog(
            'PICK',
            `Which team picks ${MAPS.find(m => m.id === mapId).name}?`,
            { label: tn(1), result: { team: 1 }, cls: 't1-clr' },
            { label: tn(2), result: { team: 2 }, cls: 't2-clr' }
        );
        if (!r) return;
        M[mapId].picked = r.team;
        timeline.push({ mapId, action: 'pick', team: r.team });
        updateMap(mapId);
        updateStats();
        await doSide(mapId);
    }

    async function doSide(mapId) {
        const s = M[mapId];
        if (s.picked === null) return;
        const r = await openDialog(
            'CT SIDE',
            `Who starts as CT on ${MAPS.find(m => m.id === mapId).name}?`,
            { label: tn(1), result: { team: 1 }, cls: 't1-clr' },
            { label: tn(2), result: { team: 2 }, cls: 't2-clr' }
        );
        if (!r) return;
        M[mapId].ctTeam = r.team;
        const picks = timeline.filter(e => e.mapId === mapId && e.action === 'pick');
        if (picks.length) picks[picks.length - 1].ctTeam = r.team;
        timeline.push({ mapId, action: 'side', team: r.team });
        updateMap(mapId);
        updateStats();
    }

    let isAnimating = false;

    playBtn.addEventListener('click', startAnim);

    async function startAnim() {
        playBtn.disabled = true;
        isAnimating = true;

        updateAll();

        const order = [];
        const seen = new Set();
        timeline.forEach(e => {
            if (!seen.has(e.mapId)) {
                seen.add(e.mapId);
                order.push(e.mapId);
            }
        });
        MAPS.forEach(m => {
            if (!seen.has(m.id)) order.push(m.id);
        });

        document.querySelector('.bottom-bar').style.opacity = '0';

        document.querySelectorAll('.map-row').forEach(r => r.classList.add('hidden-map'));
        await delay(400);

        await delay(5000);

        const fragment = document.createDocumentFragment();
        order.forEach(mapId => {
            const row = $('map-' + mapId);
            if (row) fragment.appendChild(row);
        });
        mapsContainer.appendChild(fragment);

        for (const mapId of order) {
            await delay(900);
            const row = $('map-' + mapId);
            if (row) row.classList.remove('hidden-map');
        }
    }

    renderMaps();
    t1Input.addEventListener('input', updateAll);
    t2Input.addEventListener('input', updateAll);
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
    });

})();
