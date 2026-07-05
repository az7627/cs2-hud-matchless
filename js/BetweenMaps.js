(function() {
    'use strict';

    const MAP_COUNT = 5;
    const defaultMaps = [
        { name: 'Inferno',    ctScore: '13', tScore: '8',  finished: true  },
        { name: 'Mirage',     ctScore: '11', tScore: '13', finished: false },
        { name: 'Anubis',     ctScore: '13', tScore: '10', finished: false },
        { name: '',           ctScore: '',   tScore: '',   finished: false },
        { name: '',           ctScore: '',   tScore: '',   finished: false },
    ];

    const tbody = document.getElementById('map-tbody');

    function buildMapRows() {
        let html = '';
        for (let i = 0; i < MAP_COUNT; i++) {
            const d = defaultMaps[i];
            const num = i + 1;
            html += `
                <tr class="map-row" data-index="${i}">
                    <td><span class="map-number">${num}</span></td>
                    <td>
                        <input type="text" id="map-name-${i}" class="map-input" placeholder="Map name" value="${d.name}" data-display="map-name-d-${i}" />
                        <span id="map-name-d-${i}" class="map-name-text hidden"></span>
                    </td>
                    <td>
                        <input type="number" id="map-ct-${i}" class="score-input ct" min="0" max="30" value="${d.ctScore}" data-display="map-ct-d-${i}" />
                        <span id="map-ct-d-${i}" class="score-text ct hidden"></span>
                    </td>
                    <td>
                        <input type="number" id="map-t-${i}" class="score-input t" min="0" max="30" value="${d.tScore}" data-display="map-t-d-${i}" />
                        <span id="map-t-d-${i}" class="score-text t hidden"></span>
                    </td>
                    <td>
                        <span id="map-winner-d-${i}" class="winner-badge hidden" style="display:none;"></span>
                    </td>
                    <td>
                        <span id="map-status-d-${i}" class="status-badge hidden" style="display:none;"></span>
                    </td>
                    <td style="text-align:center;">
                        <input type="radio" name="finished-map" value="${i}" id="finished-${i}" class="finished-radio" ${d.finished ? 'checked' : ''} />
                        <label for="finished-${i}" class="radio-label" id="finished-label-${i}">END</label>
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
    }
    buildMapRows();

    const confirmBtn = document.getElementById('confirm-btn');

    function syncTeamNames() {
        const teamA = document.getElementById('ct-team-name-input').value || 'Team A';
        const teamB = document.getElementById('t-team-name-input').value || 'Team B';
        document.getElementById('header-team-a').textContent = teamA;
        document.getElementById('header-team-b').textContent = teamB;
        document.getElementById('series-ct-label').textContent = teamA;
        document.getElementById('series-t-label').textContent = teamB;
    }

    function updateTopResult() {
        const teamA = document.getElementById('ct-team-name-input').value || 'Team A';
        const teamB = document.getElementById('t-team-name-input').value || 'Team B';

        let finishedIdx = -1;
        for (let i = 0; i < MAP_COUNT; i++) {
            const radio = document.getElementById('finished-' + i);
            if (radio && radio.checked) { finishedIdx = i; break; }
        }
        if (finishedIdx === -1) { finishedIdx = 0; }

        const ctScore = document.getElementById('map-ct-' + finishedIdx).value || '0';
        const tScore  = document.getElementById('map-t-' + finishedIdx).value || '0';

        document.getElementById('top-ct-name').textContent = teamA;
        document.getElementById('top-t-name').textContent  = teamB;
        document.getElementById('top-ct-score').textContent = ctScore;
        document.getElementById('top-t-score').textContent  = tScore;

        const ctNum = parseInt(ctScore, 10) || 0;
        const tNum  = parseInt(tScore, 10) || 0;
        let winner = '';
        if (ctNum > tNum) winner = teamA;
        else if (tNum > ctNum) winner = teamB;
        else winner = '—';
        document.getElementById('top-winner').innerHTML = '<i class="fa-solid fa-check"></i> WINNER: ' + winner;
    }

    document.addEventListener('input', function(e) {
        const id = e.target.id;
        if (id === 'ct-team-name-input' || id === 't-team-name-input') {
            syncTeamNames();
            updateTopResult();
        }
        if (e.target.closest('#map-tbody')) {
            updateTopResult();
            updateSeriesScore();
        }
    });
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('finished-radio')) {
            updateTopResult();
        }
    });

    function updateSeriesScore() {
        const teamA = document.getElementById('ct-team-name-input').value || 'Team A';
        const teamB = document.getElementById('t-team-name-input').value || 'Team B';
        let ctWins = 0, tWins = 0;
        for (let i = 0; i < MAP_COUNT; i++) {
            const ct = parseInt(document.getElementById('map-ct-' + i).value, 10) || 0;
            const t  = parseInt(document.getElementById('map-t-' + i).value, 10) || 0;
            const name = document.getElementById('map-name-' + i).value.trim();
            if (!name) continue;
            if (ct > t) ctWins++;
            else if (t > ct) tWins++;
        }
        document.getElementById('series-ct-score').textContent = ctWins;
        document.getElementById('series-t-score').textContent = tWins;
        document.getElementById('series-ct-label').textContent = teamA;
        document.getElementById('series-t-label').textContent = teamB;
    }
    document.addEventListener('input', function(e) {
        if (e.target.closest('#map-tbody')) {
            updateSeriesScore();
        }
    });

    syncTeamNames();
    updateTopResult();
    updateSeriesScore();

    const startTimeInput = document.getElementById('next-time-input');
    const countdownDisp  = document.getElementById('countdown-display');
    let autoTimerInterval = null;

    function formatCountdown(ms) {
        const totalSec = Math.floor(ms / 1000);
        if (totalSec <= 0) return '00:00';
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        if (hrs > 0) {
            return String(hrs).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        }
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    function updateAutoCountdown() {
        const timeStr = startTimeInput.value;
        if (!timeStr) {
            countdownDisp.textContent = '--:--';
            countdownDisp.className = 'countdown-display';
            return;
        }

        const now = new Date();
        const [h, m] = timeStr.split(':').map(Number);
        const target = new Date(now);
        target.setHours(h, m, 0, 0);

        let diffMs = target - now;

        if (diffMs <= 0) {
            if (Math.abs(diffMs) <= 2 * 3600 * 1000) {
                countdownDisp.textContent = '00:00';
                countdownDisp.className = 'countdown-display zero';
                return;
            }
            target.setDate(target.getDate() + 1);
            diffMs = target - now;
        }

        countdownDisp.textContent = formatCountdown(diffMs);
        countdownDisp.className = 'countdown-display';
    }

    autoTimerInterval = setInterval(updateAutoCountdown, 1000);
    updateAutoCountdown();
    startTimeInput.addEventListener('change', updateAutoCountdown);
    startTimeInput.addEventListener('input', updateAutoCountdown);

    const confirmAll = function() {
        const inputs = document.querySelectorAll('[data-display]');
        inputs.forEach(function(input) {
            const displayId = input.getAttribute('data-display');
            const display = document.getElementById(displayId);
            if (!display) return;
            display.textContent = input.value || input.placeholder || '—';
            input.classList.add('hidden');
            display.classList.remove('hidden');
            display.classList.add('fade-in');
        });

        for (let i = 0; i < MAP_COUNT; i++) {
            const nameInput = document.getElementById('map-name-' + i);
            const ctInput  = document.getElementById('map-ct-' + i);
            const tInput   = document.getElementById('map-t-' + i);
            const nameDisp = document.getElementById('map-name-d-' + i);
            const ctDisp   = document.getElementById('map-ct-d-' + i);
            const tDisp    = document.getElementById('map-t-d-' + i);
            const winnerDisp = document.getElementById('map-winner-d-' + i);
            const statusDisp = document.getElementById('map-status-d-' + i);

            const nameVal = nameInput.value.trim();
            if (!nameVal) {
                const row = nameInput.closest('tr');
                if (row) row.classList.add('hidden');
                continue;
            }

            nameDisp.textContent = nameVal;
            nameInput.classList.add('hidden');
            nameDisp.classList.remove('hidden');

            const ctVal = ctInput.value || '0';
            const tVal  = tInput.value || '0';
            ctDisp.textContent = ctVal;
            tDisp.textContent  = tVal;
            ctInput.classList.add('hidden');
            tInput.classList.add('hidden');
            ctDisp.classList.remove('hidden');
            tDisp.classList.remove('hidden');

            const ctNum = parseInt(ctVal, 10) || 0;
            const tNum  = parseInt(tVal, 10) || 0;

            const teamA = document.getElementById('ct-team-name-input').value || 'Team A';
            const teamB = document.getElementById('t-team-name-input').value || 'Team B';
            let winnerLabel = '';
            let winnerClass = '';
            if (ctNum > tNum) { winnerLabel = teamA; winnerClass = 'ct'; }
            else if (tNum > ctNum) { winnerLabel = teamB; winnerClass = 't'; }
            else { winnerLabel = '—'; winnerClass = ''; }

            if (winnerLabel && winnerClass) {
                winnerDisp.textContent = winnerLabel;
                winnerDisp.className = 'winner-badge ' + winnerClass;
                winnerDisp.style.display = '';
            } else {
                winnerDisp.textContent = '—';
                winnerDisp.className = 'winner-badge';
                winnerDisp.style.display = '';
            }

            const radio = document.getElementById('finished-' + i);
            if (radio && radio.checked) {
                statusDisp.innerHTML = '<span class="arrow"><i class="fa-solid fa-caret-left"></i></span> JUST ENDED';
                statusDisp.style.display = '';
                const row = nameInput.closest('tr');
                if (row) row.classList.add('finished');
            } else {
                statusDisp.textContent = '';
                statusDisp.style.display = 'none';
            }
        }

        document.querySelectorAll('.finished-radio').forEach(function(r) { r.classList.add('hidden'); });
        document.querySelectorAll('.radio-label').forEach(function(l) { l.classList.add('hidden'); });
        const ths = document.querySelectorAll('.map-table th');
        if (ths.length >= 7) ths[6].classList.add('hidden');

        const teamRow = document.getElementById('ct-team-name-input').closest('div[style*="flex"]');
        if (teamRow) teamRow.classList.add('hidden');

        confirmBtn.classList.add('hidden');

        updateTopResult();
        updateSeriesScore();
    };

    confirmBtn.addEventListener('click', confirmAll);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
        }
    });

    const contentEl = document.querySelector('.content');
    const screenEl = document.querySelector('.screen');

    function fitContent() {
        contentEl.style.transform = '';
        const cs = getComputedStyle(screenEl);
        const padTop = parseFloat(cs.paddingTop);
        const padBot = parseFloat(cs.paddingBottom);
        const availH = screenEl.clientHeight - padTop - padBot;
        const naturalH = contentEl.scrollHeight;

        if (naturalH > availH) {
            const s = availH / naturalH;
            contentEl.style.transform = 'scale(' + s + ')';
        } else {
            contentEl.style.transform = '';
        }
    }

    var rt;
    window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(fitContent, 80);
    });

    fitContent();

    confirmBtn.addEventListener('click', function () {
        setTimeout(fitContent, 300);
    });

})();
