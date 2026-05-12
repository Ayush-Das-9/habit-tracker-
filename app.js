/* app.js — Habit Tracker */

const API = '/api';

// Date info
const TODAY     = new Date();
const YEAR      = TODAY.getFullYear();
const MONTH     = TODAY.getMonth();
const TODAY_STR = `${YEAR}-${String(MONTH + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`;
const DAYS      = new Date(YEAR, MONTH + 1, 0).getDate();
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// State
let pid = null;
let activities = [];

// --- Login ---
document.getElementById('pid-btn').addEventListener('click', login);
document.getElementById('pid-input').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

async function login() {
  const input = document.getElementById('pid-input');
  const error = document.getElementById('login-error');
  const id = input.value.trim();

  if (!/^\d{5}$/.test(id)) { error.textContent = 'Must be exactly 5 digits'; return; }
  error.textContent = '';

  try {
    await fetch(`${API}/person`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: id }),
    });
    pid = id;
    showDashboard();
  } catch {
    error.textContent = 'Could not connect to server';
  }
}

// --- Logout ---
document.getElementById('logout-btn').addEventListener('click', () => {
  pid = null;
  activities = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('pid-input').value = '';
});

// --- Dashboard ---
async function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('top-pid').textContent = `ID: ${pid}`;
  await refresh();
}

async function refresh() {
  const res = await fetch(`${API}/person/${pid}/activities`);
  const data = await res.json();
  activities = data.activities || [];
  buildCalendar();
  buildList();
}

// --- Add activity ---
document.getElementById('add-btn').addEventListener('click', addActivity);
document.getElementById('new-activity').addEventListener('keydown', e => { if (e.key === 'Enter') addActivity(); });

async function addActivity() {
  const input = document.getElementById('new-activity');
  const name = input.value.trim();
  if (!name) return;

  await fetch(`${API}/person/${pid}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  input.value = '';
  await refresh();
}

// --- Calendar heatmap ---
function heatClass(count) {
  if (count === 0) return 'heat-0';
  if (count === 1) return 'heat-1';
  if (count === 2) return 'heat-2';
  if (count === 3) return 'heat-3';
  return 'heat-4';
}

function buildCalendar() {
  document.getElementById('cal-month-name').textContent = MONTHS[MONTH];
  document.getElementById('cal-year-val').textContent = YEAR;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Count completions per day
  const counts = {};
  for (let d = 1; d <= DAYS; d++) counts[d] = 0;

  activities.forEach(act => {
    (act.completions || []).forEach(dateStr => {
      const dt = new Date(dateStr);
      if (dt.getFullYear() === YEAR && dt.getMonth() === MONTH) {
        counts[dt.getDate()] = (counts[dt.getDate()] || 0) + 1;
      }
    });
  });

  // Empty cells before 1st day
  const firstDay = new Date(YEAR, MONTH, 1).getDay();
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  // Day cells
  for (let d = 1; d <= DAYS; d++) {
    const el = document.createElement('div');
    el.className = `cal-day ${heatClass(counts[d])}`;
    el.textContent = d;
    if (d === TODAY.getDate()) el.classList.add('today');
    if (d > TODAY.getDate()) el.classList.add('future');
    grid.appendChild(el);
  }
}

// --- Activity list ---
function buildList() {
  const list = document.getElementById('activities-list');
  list.innerHTML = '';

  if (activities.length === 0) {
    list.innerHTML = '<p class="empty-msg">No activities yet. Add one above!</p>';
    return;
  }

  activities.forEach(act => {
    const done = (act.completions || []).includes(TODAY_STR);

    // Card
    const card = document.createElement('div');
    card.className = `activity-card${done ? ' done' : ''}`;

    // Name
    const name = document.createElement('span');
    name.className = 'activity-name';
    name.textContent = act.name;

    // Circle indicator
    const circle = document.createElement('div');
    circle.className = 'activity-circle';

    card.appendChild(name);
    card.appendChild(circle);

    // Buttons
    const btns = document.createElement('div');
    btns.className = 'activity-btns';

    if (!done) {
      const doneBtn = document.createElement('button');
      doneBtn.className = 'btn done-btn';
      doneBtn.textContent = 'Done';
      doneBtn.addEventListener('click', async () => {
        doneBtn.disabled = true;
        await fetch(`${API}/person/${pid}/activities/${act._id}/done`, { method: 'POST' });
        await refresh();
      });
      btns.appendChild(doneBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn del-btn';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      delBtn.disabled = true;
      await fetch(`${API}/person/${pid}/activities/${act._id}`, { method: 'DELETE' });
      await refresh();
    });
    btns.appendChild(delBtn);

    list.appendChild(card);
    list.appendChild(btns);
  });
}

// --- AI Agent ---
document.getElementById('agent-btn').addEventListener('click', askAgent);
document.getElementById('agent-close').addEventListener('click', () => {
  document.getElementById('agent-overlay').style.display = 'none';
});
document.getElementById('agent-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('agent-overlay').style.display = 'none';
});

async function askAgent() {
  const overlay = document.getElementById('agent-overlay');
  const content = document.getElementById('agent-content');

  overlay.style.display = 'flex';
  content.innerHTML = '<p class="agent-loading">🤖 Agent is generating...</p>';

  try {
    const res = await fetch(`${API}/person/${pid}/agent`);
    const data = await res.json();

    if (!res.ok) {
      content.innerHTML = `<p class="agent-error">Error: ${data.detail || 'Something went wrong'}</p>`;
      return;
    }

    const answer = data.answer || 'No response from agent.';
    // Format: split by numbered lines
    const lines = answer.split('\n').filter(l => l.trim());
    let html = '';
    lines.forEach(line => {
      html += `<p class="agent-line">${line}</p>`;
    });
    content.innerHTML = html;

  } catch (err) {
    content.innerHTML = `<p class="agent-error">Could not connect to agent.</p>`;
  }
}