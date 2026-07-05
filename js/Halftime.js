(function() {
    'use strict';

    const confirmBtn = document.getElementById('confirm-btn');

    const timerDisplay = document.getElementById('timer-display');
    const timerInput   = document.getElementById('timer-input');
    const startBtn     = document.getElementById('timer-start-btn');
    const resetBtn     = document.getElementById('timer-reset-btn');

    let countdownInterval = null;
    let remainingSeconds  = 180;
    let isRunning         = false;

    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function updateTimerDisplay() {
        timerDisplay.textContent = formatTime(remainingSeconds);
    }

    function stopTimer() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        isRunning = false;
        timerDisplay.classList.remove('running', 'expired');
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
        startBtn.className = 'timer-btn start';
        startBtn.disabled = false;
    }

    function startTimer() {
        if (isRunning) return;

        if (remainingSeconds <= 0) {
            const minsInput = timerInput.value ? parseInt(timerInput.value, 10) : 3;
            remainingSeconds = (minsInput || 3) * 60;
            updateTimerDisplay();
        }

        isRunning = true;
        timerDisplay.classList.remove('expired');
        timerDisplay.classList.add('running');
        startBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
        startBtn.className = 'timer-btn';
        resetBtn.classList.remove('hidden');

        countdownInterval = setInterval(function() {
            remainingSeconds--;
            updateTimerDisplay();

            if (remainingSeconds <= 0) {
                remainingSeconds = 0;
                updateTimerDisplay();
                stopTimer();
                timerDisplay.classList.remove('running');
                timerDisplay.classList.add('expired');
                startBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Restart';
                startBtn.className = 'timer-btn start';
                startBtn.disabled = false;
            }
        }, 1000);
    }

    function pauseTimer() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        isRunning = false;
        timerDisplay.classList.remove('running');
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
        startBtn.className = 'timer-btn start';
    }

    function resetTimer() {
        stopTimer();
        const minsInput = timerInput.value ? parseInt(timerInput.value, 10) : 3;
        remainingSeconds = (minsInput || 3) * 60;
        updateTimerDisplay();
        timerDisplay.classList.remove('expired', 'running');
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
        startBtn.className = 'timer-btn start';
        resetBtn.classList.add('hidden');
    }

    startBtn.addEventListener('click', function() {
        if (remainingSeconds <= 0) {
            resetTimer();
            return;
        }
        if (isRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    });

    resetBtn.addEventListener('click', resetTimer);

    timerInput.addEventListener('input', function() {
        if (isRunning) return;
        const mins = parseInt(this.value, 10) || 1;
        remainingSeconds = mins * 60;
        updateTimerDisplay();
    });

    timerDisplay.classList.add('hidden');
    timerInput.classList.remove('hidden');

    const confirmAll = function() {
        const mins = parseInt(timerInput.value, 10) || 3;
        remainingSeconds = mins * 60;
        timerDisplay.textContent = formatTime(remainingSeconds);
        timerDisplay.classList.remove('hidden');
        timerInput.classList.add('hidden');

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
        if (e.key === 'Enter') {
            const target = e.target;
            if (target.tagName === 'INPUT') {
                e.preventDefault();
            }
        }
    });

})();
