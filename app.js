/* ─────────────────────────────────────────────────────
   app.js  —  Habit Tracker Logic (Person-based, API-backed)
───────────────────────────────────────────────────── */

const API = 'http://127.0.0.1:8000/api';

// ── Date helpers ──────────────────────────────────────
const TODAY      = new Date();
const YEAR       = TODAY.getFullYear();
const MONTH      = TODAY.getMonth();
const TODAY_STR  = TODAY.getFullYear() + '-' + String(TODAY.getMonth() + 1).padStart(2, '0') + '-' + String(TODAY.getDate()).padStart(2, '0'); // "YYYY-MM-DD" in local time
const DAYS_IN_MO = new Date(YEAR, MONTH + 1, 0).getDate();

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ── State ─────────────────────────────────────────────
let currentPID  = null;   // "12345"
let activities  = [];     // array from API

// ── DOM refs ──────────────────────────────────────────
const loginScreen  = document.getElementById('login-screen');
const appScreen    = document.getElementById('app');
const pidInput     = document.getElementById('pid-input');
const pidBtn       = document.getElementById('pid-btn');
const loginError   = document.getElementById('login-error');
const topPid       = document.getElementById('top-pid');
const logoutBtn    = document.getElementById('logout-btn');
const newActInput  = document.getElementById('new-activity-input');
const addActBtn    = document.getElementById('add-activity-btn');

// ── Login ─────────────────────────────────────────────
pidBtn.addEventListener('click', handleLogin);
pidInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

async function handleLogin() {
  const pid = pidInput.value.trim();
  if (!/^\d{5}$/.test(pid)) {
    loginError.textContent = 'Must be exactly 5 digits';
    return;
  }
  loginError.textContent = '';
  pidBtn.disabled = true;
  pidBtn.textContent = '…';

  try {
    const res = await fetch(`${API}/person`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: pid }),
    });
    if (!res.ok) throw new Error('Server error');
    currentPID = pid;
    await loadDashboard();
  } catch (err) {
    loginError.textContent = 'Could not connect to server';
  } finally {
    pidBtn.disabled = false;
    pidBtn.textContent = 'Enter';
  }
}

// ── Logout ────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
  currentPID = null;
  activities = [];
  appScreen.style.display = 'none';
  loginScreen.style.display = 'flex';
  pidInput.value = '';
});

// ── Dashboard ─────────────────────────────────────────
async function loadDashboard() {
  loginScreen.style.display = 'none';
  appScreen.style.display   = 'flex';
  topPid.textContent        = `ID: ${currentPID}`;
  await fetchActivities();
  buildCalendar();
  buildActivities();
}

// ── API calls ─────────────────────────────────────────
async function fetchActivities() {
  const res = await fetch(`${API}/person/${currentPID}/activities`);
  const data = await res.json();
  activities = data.activities || [];
}

async function apiAddActivity(name) {
  const res = await fetch(`${API}/person/${currentPID}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

async function apiDeleteActivity(actId) {
  await fetch(`${API}/person/${currentPID}/activities/${actId}`, {
    method: 'DELETE',
  });
}

async function apiToggleActivity(actId) {
  const res = await fetch(`${API}/person/${currentPID}/activities/${actId}/toggle`, {
    method: 'POST',
  });
  return res.json();
}

async function apiUpdateActivity(actId, name) {
  const res = await fetch(`${API}/person/${currentPID}/activities/${actId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

// ── Add Activity ──────────────────────────────────────
addActBtn.addEventListener('click', handleAddActivity);
newActInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAddActivity(); });

async function handleAddActivity() {
  const name = newActInput.value.trim();
  if (!name) return;
  addActBtn.disabled = true;
  try {
    await apiAddActivity(name);
    newActInput.value = '';
    await fetchActivities();
    buildCalendar();
    buildActivities();
  } finally {
    addActBtn.disabled = false;
  }
}

// ── Calendar ──────────────────────────────────────────
function heatClass(count) {
  if (count === 0) return 'heat-0';
  if (count === 1) return 'heat-1';
  if (count === 2) return 'heat-2';
  if (count === 3) return 'heat-3';
  return 'heat-4';
}

function buildCalendar() {
  document.getElementById('cal-month-name').textContent = MONTH_NAMES[MONTH];
  document.getElementById('cal-year-val').textContent   = YEAR;

  const grid     = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Build a map: dayNumber → count of activities completed that day
  const dayCounts = {};
  for (let d = 1; d <= DAYS_IN_MO; d++) dayCounts[d] = 0;

  activities.forEach(act => {
    (act.completions || []).forEach(dateStr => {
      const dt = new Date(dateStr);
      if (dt.getFullYear() === YEAR && dt.getMonth() === MONTH) {
        dayCounts[dt.getDate()] = (dayCounts[dt.getDate()] || 0) + 1;
      }
    });
  });

  const firstDay = new Date(YEAR, MONTH, 1).getDay();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let d = 1; d <= DAYS_IN_MO; d++) {
    const el    = document.createElement('div');
    const count = dayCounts[d] || 0;
    el.className = `cal-day ${heatClass(count)}`;
    el.textContent = d;
    if (d === TODAY.getDate()) el.classList.add('today');
    if (d > TODAY.getDate())   el.classList.add('future');
    grid.appendChild(el);
  }
}

// ── Activities List ───────────────────────────────────
function buildActivities() {
  const list     = document.getElementById('activities-list');
  list.innerHTML = '';

  if (activities.length === 0) {
    const empty = document.createElement('p');
    empty.className   = 'empty-msg';
    empty.textContent = 'No activities yet. Add one above!';
    list.appendChild(empty);
    return;
  }

  activities.forEach(act => {
    const isDone = (act.completions || []).includes(TODAY_STR);

    const wrapper = document.createElement('div');
    wrapper.className = 'activity-wrapper';

    // Card
    const card = document.createElement('div');
    card.className = `activity-card${isDone ? ' done' : ''}`;

    // Progress bar
    const progress = document.createElement('div');
    progress.className = 'activity-progress';
    if (isDone) progress.style.width = '100%';

    // Body
    const body = document.createElement('div');
    body.className = 'activity-body';

    const info = document.createElement('div');
    info.className = 'activity-info';

    const name = document.createElement('div');
    name.className   = 'activity-name';
    name.textContent = act.name;

    const status = document.createElement('div');
    status.className   = 'activity-status';
    status.textContent = isDone ? 'Completed' : 'Not done';

    info.appendChild(name);
    info.appendChild(status);

    // Indicator
    const indicator = document.createElement('div');
    indicator.className = 'activity-indicator';
    indicator.innerHTML = `
      <svg viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

    body.appendChild(info);
    body.appendChild(indicator);

    card.appendChild(progress);
    card.appendChild(body);

    // Actions row
    const actions = document.createElement('div');
    actions.className = 'activity-actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = isDone ? 'act-btn undo-btn' : 'act-btn toggle-btn';
    toggleBtn.textContent = isDone ? 'Undo' : 'Done';
    toggleBtn.addEventListener('click', async () => {
      toggleBtn.disabled = true;
      await apiToggleActivity(act._id);
      await fetchActivities();
      buildCalendar();
      buildActivities();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'act-btn delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      deleteBtn.disabled = true;
      await apiDeleteActivity(act._id);
      await fetchActivities();
      buildCalendar();
      buildActivities();
    });

    actions.appendChild(toggleBtn);
    actions.appendChild(deleteBtn);

    wrapper.appendChild(card);
    wrapper.appendChild(actions);
    list.appendChild(wrapper);
  });
}