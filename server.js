/* ========================================
   DayFlow — Express API Server
   Stores data in a local JSON file.
   ======================================== */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'dayflow.json');

// -------------------------------------------------------
// Middleware
// -------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve index.html, css, js

// -------------------------------------------------------
// Data helpers
// -------------------------------------------------------
function ensureDataDir() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
    }
}

function readData() {
    ensureDataDir();
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function writeData(data) {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// -------------------------------------------------------
// API Routes
// -------------------------------------------------------

// GET /api/day/:date  — get all data for a specific date
app.get('/api/day/:date', (req, res) => {
    const { date } = req.params;
    const all = readData();
    const day = all[date] || { tasks: [], feedback: {} };
    res.json(day);
});

// PUT /api/day/:date  — overwrite entire day data
app.put('/api/day/:date', (req, res) => {
    const { date } = req.params;
    const all = readData();
    all[date] = req.body;
    writeData(all);
    res.json({ ok: true });
});

// POST /api/day/:date/tasks  — add a task
app.post('/api/day/:date/tasks', (req, res) => {
    const { date } = req.params;
    const all = readData();
    if (!all[date]) all[date] = { tasks: [], feedback: {} };
    all[date].tasks.push(req.body);
    writeData(all);
    res.json({ ok: true, task: req.body });
});

// PATCH /api/day/:date/tasks/:id  — update a task (toggle, edit)
app.patch('/api/day/:date/tasks/:id', (req, res) => {
    const { date, id } = req.params;
    const all = readData();
    if (!all[date]) return res.status(404).json({ error: 'Day not found' });
    const task = all[date].tasks.find(t => t.id === id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    Object.assign(task, req.body);
    writeData(all);
    res.json({ ok: true, task });
});

// DELETE /api/day/:date/tasks/:id  — delete a task
app.delete('/api/day/:date/tasks/:id', (req, res) => {
    const { date, id } = req.params;
    const all = readData();
    if (!all[date]) return res.status(404).json({ error: 'Day not found' });
    all[date].tasks = all[date].tasks.filter(t => t.id !== id);
    writeData(all);
    res.json({ ok: true });
});

// PUT /api/day/:date/feedback/:hour  — save feedback for an hour
app.put('/api/day/:date/feedback/:hour', (req, res) => {
    const { date, hour } = req.params;
    const { text } = req.body;
    const all = readData();
    if (!all[date]) all[date] = { tasks: [], feedback: {} };
    if (!all[date].feedback) all[date].feedback = {};
    all[date].feedback[hour] = text;
    writeData(all);
    res.json({ ok: true });
});

// -------------------------------------------------------
// Start
// -------------------------------------------------------
app.listen(PORT, () => {
    ensureDataDir();
    console.log(`\n  ✨ DayFlow server running at http://localhost:${PORT}\n`);
});
