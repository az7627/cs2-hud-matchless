(function() {
    'use strict';

    const confirmBtn = document.getElementById('confirm-btn');

    const startTimeInput = document.getElementById('start-time-input');
    const countdownDisp  = document.getElementById('countdown-display');
    let countdownInterval = null;

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

    function updateCountdown() {
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

    countdownInterval = setInterval(updateCountdown, 1000);
    updateCountdown();

    startTimeInput.addEventListener('change', updateCountdown);
    startTimeInput.addEventListener('input', updateCountdown);

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

        document.querySelector('.timer-label')?.classList.add('hidden');
        startTimeInput.classList.add('hidden');

        confirmBtn.classList.add('hidden');
    };

    confirmBtn.addEventListener('click', confirmAll);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
        }
    });

})();
