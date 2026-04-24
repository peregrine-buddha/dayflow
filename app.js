/* ========================================
   DayFlow v1 — Redesigned Application Logic
   Pop animations, particles, toasts, and
   server sync with localStorage cache.
   ======================================== */

(function () {
    'use strict';

    // -------------------------------------------------------
    // Config
    // -------------------------------------------------------
    const API_BASE = window.location.origin + '/api';
    const STORAGE_KEY = 'dayflow_data';

    // -------------------------------------------------------
    // State
    // -------------------------------------------------------
    let currentDate = todayStr();
    let filterMode = 'all';
    let debounceTimers = {};

    // -------------------------------------------------------
    // Helpers
    // -------------------------------------------------------
    function todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function formatDateDisplay(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    function shiftDate(dateStr, delta) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + delta);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function formatTime12(h) {
        const suffix = h >= 12 ? 'PM' : 'AM';
        const hr = h % 12 || 12;
        return { hour: String(hr), period: suffix };
    }

    function nowTimeStr() {
        return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // -------------------------------------------------------
    // Particle Background
    // -------------------------------------------------------
    (function initParticles() {
        const canvas = document.getElementById('particle-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let particles = [];
        const PARTICLE_COUNT = 50;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                r: Math.random() * 1.5 + 0.5,
                alpha: Math.random() * 0.3 + 0.05,
            });
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height;
                if (p.y > canvas.height) p.y = 0;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(192, 132, 252, ${p.alpha})`;
                ctx.fill();
            });

            // Draw subtle connecting lines
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(192, 132, 252, ${0.03 * (1 - dist / 120)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(draw);
        }
        draw();
    })();

    // -------------------------------------------------------
    // Pop Particles Effect
    // -------------------------------------------------------
    function spawnPopParticles(x, y, colors, count = 12) {
        const container = document.getElementById('pop-particles');
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'pop-particle';
            const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5);
            const dist = 40 + Math.random() * 60;
            const tx = Math.cos(angle) * dist;
            const ty = Math.sin(angle) * dist;
            const size = 4 + Math.random() * 6;
            const color = colors[Math.floor(Math.random() * colors.length)];

            el.style.cssText = `
                left: ${x}px; top: ${y}px;
                width: ${size}px; height: ${size}px;
                background: ${color};
                --tx: ${tx}px; --ty: ${ty}px;
                animation-delay: ${Math.random() * 80}ms;
                animation-duration: ${500 + Math.random() * 300}ms;
            `;
            container.appendChild(el);
            setTimeout(() => el.remove(), 1000);
        }

        // Add a few star shapes
        for (let i = 0; i < 4; i++) {
            const star = document.createElement('div');
            star.className = 'pop-star';
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 50;
            const tx = Math.cos(angle) * dist;
            const ty = Math.sin(angle) * dist;
            const color = colors[Math.floor(Math.random() * colors.length)];

            star.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="${color}"><polygon points="12 2 15 9 22 9 16 14 18 22 12 17 6 22 8 14 2 9 9 9"/></svg>`;
            star.style.cssText = `
                left: ${x}px; top: ${y}px;
                --tx: ${tx}px; --ty: ${ty}px;
            `;
            container.appendChild(star);
            setTimeout(() => star.remove(), 1000);
        }
    }

    // -------------------------------------------------------
    // Toast Notifications
    // -------------------------------------------------------
    function showToast(icon, message, duration = 2500) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 350);
        }, duration);
    }

    // -------------------------------------------------------
    // Local Storage (cache)
    // -------------------------------------------------------
    function loadCacheAll() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
        catch { return {}; }
    }

    function saveCacheAll(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function getCachedDay(dateStr) {
        const all = loadCacheAll();
        return all[dateStr] || { tasks: [], feedback: {} };
    }

    function setCachedDay(dateStr, dayData) {
        const all = loadCacheAll();
        all[dateStr] = dayData;
        saveCacheAll(all);
    }

    // -------------------------------------------------------
    // Server API
    // -------------------------------------------------------
    async function apiFetchDay(dateStr) {
        try {
            const res = await fetch(`${API_BASE}/day/${dateStr}`);
            if (!res.ok) throw new Error('Server error');
            const data = await res.json();
            setCachedDay(dateStr, data);
            return data;
        } catch (err) {
            console.warn('API fetch failed, using cache:', err.message);
            return getCachedDay(dateStr);
        }
    }

    async function apiAddTask(dateStr, task) {
        try { await fetch(`${API_BASE}/day/${dateStr}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) }); }
        catch (err) { console.warn('API addTask failed:', err.message); }
    }

    async function apiToggleTask(dateStr, taskId, completed) {
        try { await fetch(`${API_BASE}/day/${dateStr}/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }) }); }
        catch (err) { console.warn('API toggleTask failed:', err.message); }
    }

    async function apiDeleteTask(dateStr, taskId) {
        try { await fetch(`${API_BASE}/day/${dateStr}/tasks/${taskId}`, { method: 'DELETE' }); }
        catch (err) { console.warn('API deleteTask failed:', err.message); }
    }

    async function apiSaveFeedback(dateStr, hour, text) {
        try { await fetch(`${API_BASE}/day/${dateStr}/feedback/${hour}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); }
        catch (err) { console.warn('API saveFeedback failed:', err.message); }
    }

    // -------------------------------------------------------
    // DOM References
    // -------------------------------------------------------
    const $ = id => document.getElementById(id);
    const $dateDisplay = $('date-display');
    const $prevDay = $('prev-day');
    const $nextDay = $('next-day');
    const $todayBtn = $('today-btn');
    const $statCompleted = $('stat-completed');
    const $statProgress = $('stat-progress');
    const $statFeedback = $('stat-feedback');
    const $statStreak = $('stat-streak');
    const $progressRing = $('progress-ring');
    const $statBarFill = $('stat-bar-fill');
    const $addForm = $('add-task-form');
    const $taskInput = $('task-input');
    const $prioritySelect = $('priority-select');
    const $taskList = $('task-list');
    const $tasksEmpty = $('tasks-empty');
    const $tasksCount = $('tasks-count');
    const $filterBtn = $('filter-btn');
    const $filterLabel = $('filter-label');
    const $feedbackTimeline = $('feedback-timeline');
    const $feedbackCount = $('feedback-count');
    const $currentTime = $('current-time');

    // -------------------------------------------------------
    // Render: Date
    // -------------------------------------------------------
    function renderDate() {
        $dateDisplay.textContent = formatDateDisplay(currentDate);
        const isToday = currentDate === todayStr();
        $todayBtn.style.opacity = isToday ? '0.35' : '1';
        $todayBtn.style.pointerEvents = isToday ? 'none' : 'auto';
    }

    // -------------------------------------------------------
    // Render: Stats with animation
    // -------------------------------------------------------
    let prevStats = { done: -1, pct: -1, fb: -1 };

    function renderStats() {
        const day = getCachedDay(currentDate);
        const total = day.tasks.length;
        const done = day.tasks.filter(t => t.completed).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const fbCount = Object.values(day.feedback || {}).filter(v => v.trim().length > 0).length;

        // Animated value bump
        if (prevStats.done !== done) {
            $statCompleted.textContent = `${done}/${total}`;
            $statCompleted.classList.remove('bump');
            void $statCompleted.offsetWidth;
            $statCompleted.classList.add('bump');
        } else {
            $statCompleted.textContent = `${done}/${total}`;
        }

        if (prevStats.pct !== pct) {
            $statProgress.textContent = `${pct}%`;
            $statProgress.classList.remove('bump');
            void $statProgress.offsetWidth;
            $statProgress.classList.add('bump');
        } else {
            $statProgress.textContent = `${pct}%`;
        }

        $statFeedback.textContent = fbCount;

        // Progress ring (circumference = 2πr = 2 × π × 18 ≈ 113.1)
        const circ = 113.1;
        $progressRing.style.strokeDashoffset = circ - (circ * pct / 100);

        // Stat bar fill
        $statBarFill.style.width = `${pct}%`;

        // Streak calculation
        let streak = 0;
        const allData = loadCacheAll();
        let checkDate = todayStr();
        while (true) {
            const d = allData[checkDate];
            if (d && d.tasks.length > 0 && d.tasks.some(t => t.completed)) {
                streak++;
                checkDate = shiftDate(checkDate, -1);
            } else {
                break;
            }
        }
        $statStreak.textContent = streak > 0 ? `${streak}🔥` : '—';

        prevStats = { done, pct, fb: fbCount };
    }

    // -------------------------------------------------------
    // Render: Tasks
    // -------------------------------------------------------
    function renderTasks(newTaskId = null) {
        const day = getCachedDay(currentDate);
        let tasks = day.tasks;

        if (filterMode === 'active') tasks = tasks.filter(t => !t.completed);
        else if (filterMode === 'completed') tasks = tasks.filter(t => t.completed);

        $taskList.innerHTML = '';

        if (tasks.length === 0) {
            $tasksEmpty.classList.add('visible');
        } else {
            $tasksEmpty.classList.remove('visible');
        }

        $tasksCount.textContent = `${day.tasks.length} task${day.tasks.length !== 1 ? 's' : ''}`;

        tasks.forEach((task, idx) => {
            const el = document.createElement('div');
            el.className = 'task-item';
            if (task.completed) el.classList.add('completed');
            if (task.id === newTaskId) el.classList.add('popping-in');
            el.dataset.priority = task.priority || 'medium';
            el.dataset.id = task.id;

            if (task.id !== newTaskId) {
                el.style.animationDelay = `${idx * 30}ms`;
                el.classList.add('popping-in');
            }

            el.innerHTML = `
                <label class="task-checkbox">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Mark task complete">
                    <span class="checkmark">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                </label>
                <span class="task-text">${escapeHtml(task.text)}</span>
                <span class="task-time">${task.time || ''}</span>
                <button class="task-delete" aria-label="Delete task">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            `;

            // Checkbox handler
            const checkbox = el.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                const checked = e.target.checked;
                toggleTask(task.id, checked);

                if (checked) {
                    // Celebration pop!
                    const rect = el.getBoundingClientRect();
                    const cx = rect.left + rect.width / 2;
                    const cy = rect.top + rect.height / 2;
                    spawnPopParticles(cx, cy, ['#34d399', '#6ee7b7', '#a7f3d0', '#fbbf24', '#c084fc'], 16);
                    el.classList.add('celebrate');
                    showToast('✅', 'Task completed!');
                }
            });

            // Delete handler
            el.querySelector('.task-delete').addEventListener('click', () => {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                spawnPopParticles(cx, cy, ['#f43f5e', '#fb7185', '#fda4af', '#fecdd3'], 10);
                el.classList.add('popping-out');
                showToast('🗑️', 'Task removed');
                setTimeout(() => deleteTask(task.id), 400);
            });

            $taskList.appendChild(el);
        });

        renderStats();
    }

    // -------------------------------------------------------
    // Task Actions
    // -------------------------------------------------------
    function addTask(text, priority) {
        const day = getCachedDay(currentDate);
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const task = {
            id: uid(),
            text: text.trim(),
            priority,
            completed: false,
            time: timeStr,
            createdAt: now.toISOString()
        };
        day.tasks.push(task);
        setCachedDay(currentDate, day);
        renderTasks(task.id);

        // Pop on the add button
        const btn = $('add-task-btn');
        const rect = btn.getBoundingClientRect();
        spawnPopParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, ['#c084fc', '#818cf8', '#f472b6', '#fbbf24'], 14);
        showToast('✨', `"${text.length > 30 ? text.slice(0, 30) + '…' : text}" added!`);

        apiAddTask(currentDate, task);
    }

    function toggleTask(id, completed) {
        const day = getCachedDay(currentDate);
        const task = day.tasks.find(t => t.id === id);
        if (task) {
            task.completed = completed;
            setCachedDay(currentDate, day);
            renderTasks();
            apiToggleTask(currentDate, id, completed);
        }
    }

    function deleteTask(id) {
        const day = getCachedDay(currentDate);
        day.tasks = day.tasks.filter(t => t.id !== id);
        setCachedDay(currentDate, day);
        renderTasks();
        apiDeleteTask(currentDate, id);
    }

    // -------------------------------------------------------
    // Render: Hourly Feedback
    // -------------------------------------------------------
    function renderFeedback() {
        const day = getCachedDay(currentDate);
        const feedback = day.feedback || {};
        const now = new Date();
        const currentHour = now.getHours();
        const isToday = currentDate === todayStr();

        $feedbackTimeline.innerHTML = '';

        for (let h = 5; h <= 23; h++) {
            const key = String(h);
            const { hour, period } = formatTime12(h);
            const value = feedback[key] || '';
            const hasFeedback = value.trim().length > 0;
            const isPast = isToday && h < currentHour;
            const isCurrent = isToday && h === currentHour;

            const slot = document.createElement('div');
            slot.className = 'feedback-slot';
            if (isCurrent) slot.classList.add('current-hour');
            if (hasFeedback) slot.classList.add('has-feedback');
            if (isPast) slot.classList.add('past-hour');

            slot.innerHTML = `
                <div class="feedback-time-col">
                    <span class="feedback-hour">${hour}</span>
                    <span class="feedback-period">${period}</span>
                    <span class="feedback-dot"></span>
                </div>
                <div class="feedback-input-col">
                    <textarea
                        class="feedback-textarea${hasFeedback ? ' has-content' : ''}"
                        placeholder="${isCurrent ? "How's this hour going?" : isPast ? 'What did you accomplish?' : 'Plan for this hour…'}"
                        data-hour="${key}"
                        rows="1"
                    >${escapeHtml(value)}</textarea>
                </div>
            `;

            const textarea = slot.querySelector('.feedback-textarea');
            textarea.addEventListener('input', (e) => {
                const day = getCachedDay(currentDate);
                if (!day.feedback) day.feedback = {};
                day.feedback[key] = e.target.value;
                setCachedDay(currentDate, day);

                if (e.target.value.trim()) {
                    e.target.classList.add('has-content');
                    slot.classList.add('has-feedback');
                } else {
                    e.target.classList.remove('has-content');
                    slot.classList.remove('has-feedback');
                }
                autoResize(e.target);
                renderStats();

                clearTimeout(debounceTimers[`fb-${key}`]);
                debounceTimers[`fb-${key}`] = setTimeout(() => {
                    apiSaveFeedback(currentDate, key, e.target.value);
                }, 300);
            });

            $feedbackTimeline.appendChild(slot);
            requestAnimationFrame(() => autoResize(textarea));
        }

        if (isToday) {
            const currentSlot = $feedbackTimeline.querySelector('.current-hour');
            if (currentSlot) {
                setTimeout(() => currentSlot.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
            }
        }

        const fbCount = Object.values(feedback).filter(v => v.trim().length > 0).length;
        $feedbackCount.textContent = `${fbCount} entr${fbCount !== 1 ? 'ies' : 'y'}`;
    }

    function autoResize(el) {
        el.style.height = 'auto';
        el.style.height = Math.max(42, el.scrollHeight) + 'px';
    }

    // -------------------------------------------------------
    // Clock
    // -------------------------------------------------------
    function updateClock() {
        $currentTime.textContent = nowTimeStr();
    }

    // -------------------------------------------------------
    // Event Listeners
    // -------------------------------------------------------
    $addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = $taskInput.value.trim();
        if (!text) return;
        addTask(text, $prioritySelect.value);
        $taskInput.value = '';
        $taskInput.focus();
    });

    $prevDay.addEventListener('click', () => { currentDate = shiftDate(currentDate, -1); renderAll(); });
    $nextDay.addEventListener('click', () => { currentDate = shiftDate(currentDate, 1); renderAll(); });
    $todayBtn.addEventListener('click', () => { currentDate = todayStr(); renderAll(); });

    const filterModes = ['all', 'active', 'completed'];
    $filterBtn.addEventListener('click', () => {
        const idx = (filterModes.indexOf(filterMode) + 1) % filterModes.length;
        filterMode = filterModes[idx];
        $filterLabel.textContent = filterMode.charAt(0).toUpperCase() + filterMode.slice(1);
        renderTasks();
    });

    // -------------------------------------------------------
    // Render All
    // -------------------------------------------------------
    async function renderAll() {
        renderDate();
        renderTasks();
        renderFeedback();
        renderStats();
        await apiFetchDay(currentDate);
        renderTasks();
        renderFeedback();
        renderStats();
    }

    // -------------------------------------------------------
    // Init
    // -------------------------------------------------------
    renderAll();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(() => { if (currentDate === todayStr()) renderFeedback(); }, 60000);

})();
