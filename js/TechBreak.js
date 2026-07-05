(function() {
    'use strict';

    const confirmBtn = document.getElementById('confirm-btn');

    const timerDisplay = document.getElementById('timer-display');
    const startBtn     = document.getElementById('timer-start-btn');
    const pauseBtn     = document.getElementById('timer-pause-btn');
    const resetBtn     = document.getElementById('timer-reset-btn');

    let interval   = null;
    let elapsedSec = 0;
    let isRunning  = false;

    function formatElapsed(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    function updateDisplay() {
        timerDisplay.textContent = formatElapsed(elapsedSec);
    }
    function tick() {
        elapsedSec++;
        updateDisplay();
    }

    function startTimer() {
        if (isRunning) return;
        isRunning = true;
        timerDisplay.classList.remove('paused');
        timerDisplay.classList.add('running');
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        resetBtn.classList.remove('hidden');
        interval = setInterval(tick, 1000);
    }
    function pauseTimer() {
        if (!isRunning) return;
        isRunning = false;
        if (interval) { clearInterval(interval); interval = null; }
        timerDisplay.classList.remove('running');
        timerDisplay.classList.add('paused');
        startBtn.classList.remove('hidden');
        startBtn.textContent = '▶ Resume';
        pauseBtn.classList.add('hidden');
    }
    function resetTimerFn() {
        if (interval) { clearInterval(interval); interval = null; }
        isRunning = false;
        elapsedSec = 0;
        updateDisplay();
        timerDisplay.classList.remove('running', 'paused');
        startBtn.classList.remove('hidden');
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
        pauseBtn.classList.add('hidden');
        resetBtn.classList.add('hidden');
    }

    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimerFn);

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
        confirmBtn.classList.add('hidden');
    };
    confirmBtn.addEventListener('click', confirmAll);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
        }
    });

})();
