(function() {
    'use strict';

    const MAP_COUNT = 5;
    const defaultMaps = [
        { name: 'Inferno', ct: '13', t: '8' },
        { name: 'Mirage',  ct: '11', t: '13' },
        { name: 'Anubis',  ct: '13', t: '10' },
        { name: '',        ct: '',   t: '' },
        { name: '',        ct: '',   t: '' },
    ];

    const tbody = document.getElementById('bd-tbody');
    function buildRows() {
        let html = '';
        for (let i = 0; i < MAP_COUNT; i++) {
            const d = defaultMaps[i];
            html += `
                <tr class="bd-row" data-idx="${i}">
                    <td><span class="map-num">${i+1}</span></td>
                    <td>
                        <input type="text" id="bd-name-${i}" class="map-input" placeholder="Map name" value="${d.name}" data-display="bd-name-d-${i}" />
                        <span id="bd-name-d-${i}" class="map-name-text hidden"></span>
                    </td>
                    <td>
                        <input type="number" id="bd-ct-${i}" class="score-bd-input" min="0" max="30" value="${d.ct}" data-display="bd-ct-d-${i}" />
                        <span id="bd-ct-d-${i}" class="score-val ct hidden"></span>
                    </td>
                    <td>
                        <input type="number" id="bd-t-${i}" class="score-bd-input" min="0" max="30" value="${d.t}" data-display="bd-t-d-${i}" />
                        <span id="bd-t-d-${i}" class="score-val t hidden"></span>
                    </td>
                    <td><span id="bd-win-${i}" class="win-icon"></span></td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
    }
    buildRows();

    const confirmBtn = document.getElementById('confirm-btn');

    function syncTeamNames() {
        const teamA = document.getElementById('ct-name-input').value || 'Team A';
        const teamB = document.getElementById('t-name-input').value || 'Team B';
        document.getElementById('result-header-a').textContent = teamA;
        document.getElementById('result-header-b').textContent = teamB;
        document.querySelector('.team-badge.ct .side').textContent = teamA;
        document.querySelector('.team-badge.t .side').textContent = teamB;
    }

    function updateLiveDisplay() {
        const winnerInput = document.getElementById('winner-input');
        const teamA = document.getElementById('ct-name-input').value || 'Team A';
        const teamB = document.getElementById('t-name-input').value || 'Team B';

        let ctWins = 0, tWins = 0;
        for (let i = 0; i < MAP_COUNT; i++) {
            const name = document.getElementById('bd-name-' + i).value.trim();
            if (!name) continue;
            const ct = parseInt(document.getElementById('bd-ct-' + i).value, 10) || 0;
            const t  = parseInt(document.getElementById('bd-t-' + i).value, 10) || 0;
            if (ct > t) ctWins++;
            else if (t > ct) tWins++;
        }
        for (let i = 0; i < MAP_COUNT; i++) {
            const name = document.getElementById('bd-name-' + i).value.trim();
            const ct = parseInt(document.getElementById('bd-ct-' + i).value, 10) || 0;
            const t  = parseInt(document.getElementById('bd-t-' + i).value, 10) || 0;
            const winEl = document.getElementById('bd-win-' + i);
            if (!name) { winEl.textContent = ''; continue; }
            if (ct > t) { winEl.innerHTML = '<i class="fa-solid fa-star"></i>'; winEl.className = 'win-icon win-ct'; }
            else if (t > ct) { winEl.innerHTML = '<i class="fa-solid fa-star"></i>'; winEl.className = 'win-icon win-t'; }
            else { winEl.textContent = '—'; winEl.className = 'win-icon'; }
        }

        document.getElementById('final-ct-input').value = ctWins;
        document.getElementById('final-t-input').value = tWins;

        if (ctWins > tWins) {
            winnerInput.value = teamA;
        } else if (tWins > ctWins) {
            winnerInput.value = teamB;
        }

        syncTeamNames();
    }

    document.addEventListener('input', updateLiveDisplay);
    document.addEventListener('change', updateLiveDisplay);
    updateLiveDisplay();

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
            const nameInput = document.getElementById('bd-name-' + i);
            const nameVal = nameInput.value.trim();
            if (!nameVal) {
                const row = nameInput.closest('tr');
                if (row) row.classList.add('hidden');
                continue;
            }
            const teamA = document.getElementById('ct-name-input').value || 'Team A';
            const teamB = document.getElementById('t-name-input').value || 'Team B';
            const ctVal = parseInt(document.getElementById('bd-ct-' + i).value, 10) || 0;
            const tVal  = parseInt(document.getElementById('bd-t-' + i).value, 10) || 0;
            const winEl = document.getElementById('bd-win-' + i);
            if (ctVal > tVal) { winEl.innerHTML = '<i class="fa-solid fa-star"></i>'; winEl.className = 'win-icon win-ct fade-in'; }
            else if (tVal > ctVal) { winEl.innerHTML = '<i class="fa-solid fa-star"></i>'; winEl.className = 'win-icon win-t fade-in'; }
            else { winEl.textContent = '—'; winEl.className = 'win-icon fade-in'; }
        }

        confirmBtn.classList.add('hidden');
    };

    confirmBtn.addEventListener('click', confirmAll);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
        }
    });

})();
