/* ========================================
   DayFlow — Application Logic
   Syncs with server API, uses localStorage
   as a fast cache / offline fallback.
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
    let filterMode = 'all'; // all | active | completed
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
        const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        return d.toLocaleDateString('en-US', options);
    }

    function shiftDate(dateStr, delta) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + delta);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function formatTime12(h) {
        const suffix = h >= 12 ? 'PM' : 'AM';
        const hr = h % 12 || 12;
        return { hour: String(hr).padStart(2, ' '), period: suffix };
    }

    function nowTimeStr() {
        const d = new Date();
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // -------------------------------------------------------
    // Local Storage (cache layer)
    // -------------------------------------------------------
    function loadCacheAll() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
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
            setCachedDay(dateStr, data); // update local cache
            return data;
        } catch (err) {
            console.warn('API fetch failed, using cache:', err.message);
            return getCachedDay(dateStr);
        }
    }

    async function apiAddTask(dateStr, task) {
        try {
            await fetch(`${API_BASE}/day/${dateStr}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task),
            });
        } catch (err) {
            console.warn('API addTask failed:', err.message);
        }
    }

    async function apiToggleTask(dateStr, taskId, completed) {
        try {
            await fetch(`${API_BASE}/day/${dateStr}/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed }),
            });
        } catch (err) {
            console.warn('API toggleTask failed:', err.message);
        }
    }

    async function apiDeleteTask(dateStr, taskId) {
        try {
            await fetch(`${API_BASE}/day/${dateStr}/tasks/${taskId}`, {
                method: 'DELETE',
            });
        } catch (err) {
            console.warn('API deleteTask failed:', err.message);
        }
    }

    async function apiSaveFeedback(dateStr, hour, text) {
        try {
            await fetch(`${API_BASE}/day/${dateStr}/feedback/${hour}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
        } catch (err) {
            console.warn('API saveFeedback failed:', err.message);
        }
    }

    // -------------------------------------------------------
    // DOM References
    // -------------------------------------------------------
    const $dateDisplay = document.getElementById('date-display');
    const $prevDay = document.getElementById('prev-day');
    const $nextDay = document.getElementById('next-day');
    const $todayBtn = document.getElementById('today-btn');

    const $statCompleted = document.getElementById('stat-completed');
    const $statProgress = document.getElementById('stat-progress');
    const $statFeedback = document.getElementById('stat-feedback');
    const $progressRing = document.getElementById('progress-ring');

    const $addForm = document.getElementById('add-task-form');
    const $taskInput = document.getElementById('task-input');
    const $prioritySelect = document.getElementById('priority-select');
    const $taskList = document.getElementById('task-list');
    const $tasksEmpty = document.getElementById('tasks-empty');
    const $tasksCount = document.getElementById('tasks-count');
    const $filterBtn = document.getElementById('filter-btn');
    const $filterLabel = document.getElementById('filter-label');

    const $feedbackTimeline = document.getElementById('feedback-timeline');
    const $feedbackCount = document.getElementById('feedback-count');
    const $currentTime = document.getElementById('current-time');

    // -------------------------------------------------------
    // Render: Date
    // -------------------------------------------------------
    function renderDate() {
        $dateDisplay.textContent = formatDateDisplay(currentDate);
        const isToday = currentDate === todayStr();
        $todayBtn.style.opacity = isToday ? '0.4' : '1';
        $todayBtn.style.pointerEvents = isToday ? 'none' : 'auto';
    }

    // -------------------------------------------------------
    // Render: Stats
    // -------------------------------------------------------
    function renderStats() {
        const day = getCachedDay(currentDate);
        const total = day.tasks.length;
        const done = day.tasks.filter(t => t.completed).length;
        const pct = total ? Math.round((done / total) * 100) : 0;

        $statCompleted.textContent = `${done}/${total}`;
        $statProgress.textContent = `${pct}%`;

        // Feedback count
        const fbCount = Object.values(day.feedback || {}).filter(v => v.trim().length > 0).length;
        $statFeedback.textContent = fbCount;

        // Progress ring: circumference ≈ 99.9
        const circ = 99.9;
        const offset = circ - (circ * pct / 100);
        $progressRing.style.strokeDashoffset = offset;
    }

    // -------------------------------------------------------
    // Render: Tasks
    // -------------------------------------------------------
    function renderTasks() {
        const day = getCachedDay(currentDate);
        let tasks = day.tasks;

        // filter
        if (filterMode === 'active') tasks = tasks.filter(t => !t.completed);
        else if (filterMode === 'completed') tasks = tasks.filter(t => t.completed);

        $taskList.innerHTML = '';

        if (tasks.length === 0) {
            $tasksEmpty.classList.add('visible');
        } else {
            $tasksEmpty.classList.remove('visible');
        }

        const totalAll = day.tasks.length;
        $tasksCount.textContent = `${totalAll} task${totalAll !== 1 ? 's' : ''}`;

        tasks.forEach((task, idx) => {
            const el = document.createElement('div');
            el.className = `task-item${task.completed ? ' completed' : ''}`;
            el.dataset.priority = task.priority || 'medium';
            el.dataset.id = task.id;
            el.style.animationDelay = `${idx * 40}ms`;

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

            // checkbox
            el.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                toggleTask(task.id, e.target.checked);
            });

            // delete
            el.querySelector('.task-delete').addEventListener('click', () => {
                el.classList.add('removing');
                setTimeout(() => deleteTask(task.id), 300);
            });

            $taskList.appendChild(el);
        });

        renderStats();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // -------------------------------------------------------
    // Task Actions (cache-first, then sync to server)
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
        renderTasks();
        // sync to server
        apiAddTask(currentDate, task);
    }

    function toggleTask(id, completed) {
        const day = getCachedDay(currentDate);
        const task = day.tasks.find(t => t.id === id);
        if (task) {
            task.completed = completed;
            setCachedDay(currentDate, day);
            renderTasks();
            // sync to server
            apiToggleTask(currentDate, id, completed);
        }
    }

    function deleteTask(id) {
        const day = getCachedDay(currentDate);
        day.tasks = day.tasks.filter(t => t.id !== id);
        setCachedDay(currentDate, day);
        renderTasks();
        // sync to server
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

        // Show hours 5 AM to 11 PM (5–23)
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
                    <span class="feedback-hour">${hour.trim()}</span>
                    <span class="feedback-period">${period}</span>
                    <span class="feedback-dot"></span>
                </div>
                <div class="feedback-input-col">
                    <textarea
                        class="feedback-textarea${hasFeedback ? ' has-content' : ''}"
                        placeholder="${isCurrent ? 'How\'s this hour going?' : isPast ? 'What did you accomplish?' : 'Plan for this hour…'}"
                        data-hour="${key}"
                        rows="1"
                    >${escapeHtml(value)}</textarea>
                </div>
            `;

            const textarea = slot.querySelector('.feedback-textarea');
            textarea.addEventListener('input', (e) => {
                // Update local cache immediately
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

                // Debounced sync to server (300ms after user stops typing)
                clearTimeout(debounceTimers[`fb-${key}`]);
                debounceTimers[`fb-${key}`] = setTimeout(() => {
                    apiSaveFeedback(currentDate, key, e.target.value);
                }, 300);
            });

            $feedbackTimeline.appendChild(slot);

            // Auto-resize on load
            requestAnimationFrame(() => autoResize(textarea));
        }

        // Scroll to current hour
        if (isToday) {
            const currentSlot = $feedbackTimeline.querySelector('.current-hour');
            if (currentSlot) {
                setTimeout(() => {
                    currentSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 400);
            }
        }

        // Update feedback count badge
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

    // Add task
    $addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = $taskInput.value.trim();
        if (!text) return;
        const priority = $prioritySelect.value;
        addTask(text, priority);
        $taskInput.value = '';
        $taskInput.focus();
    });

    // Date navigation
    $prevDay.addEventListener('click', () => {
        currentDate = shiftDate(currentDate, -1);
        renderAll();
    });

    $nextDay.addEventListener('click', () => {
        currentDate = shiftDate(currentDate, 1);
        renderAll();
    });

    $todayBtn.addEventListener('click', () => {
        currentDate = todayStr();
        renderAll();
    });

    // Filter
    const filterModes = ['all', 'active', 'completed'];
    $filterBtn.addEventListener('click', () => {
        const idx = (filterModes.indexOf(filterMode) + 1) % filterModes.length;
        filterMode = filterModes[idx];
        $filterLabel.textContent = filterMode.charAt(0).toUpperCase() + filterMode.slice(1);
        renderTasks();
    });

    // -------------------------------------------------------
    // Render All (fetch from server, then render)
    // -------------------------------------------------------
    async function renderAll() {
        renderDate();
        // Render immediately from cache
        renderTasks();
        renderFeedback();
        renderStats();
        // Then fetch fresh data from server and re-render
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

    // Re-highlight current hour every minute
    setInterval(() => {
        if (currentDate === todayStr()) {
            renderFeedback();
        }
    }, 60000);

})();
