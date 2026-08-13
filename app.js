import { goalWeightForDate, findPhase } from './trend-line.js';

const ENTRIES_KEY = 'entries';
const PHASES_KEY = 'phases';
const PHASE_COLORS = { bulk: '#C98A3E', cut: '#3E6B8A', maintenance: '#6B7C6B' };

let chart; // Chart.js instance, created once then updated in place

// ---------- storage ----------

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(ENTRIES_KEY)) ?? []; }
  catch { return []; }
}
function saveEntries(entries) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}
function loadPhases() {
  try { return JSON.parse(localStorage.getItem(PHASES_KEY)) ?? []; }
  catch { return []; }
}
function savePhases(phases) {
  localStorage.setItem(PHASES_KEY, JSON.stringify(phases));
}

// ---------- date helpers ----------
// 'today' is read from the browser's local calendar day (getFullYear/getMonth/getDate),
// deliberately NOT toISOString(), which reports the UTC day and can be off by one
// depending on timezone and time of day. Once a date is a plain 'YYYY-MM-DD' string,
// trend-line.js's UTC-midnight parsing treats it purely as a calendar-day identifier,
// so the two approaches don't conflict.

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildDateRange(entries, phases) {
  const today = localDateStr();
  const allDates = [
    ...entries.map((e) => e.date),
    ...phases.map((p) => p.startDate),
    ...phases.filter((p) => p.endDate).map((p) => p.endDate),
    today,
  ];
  if (allDates.length === 0) return [today];

  const min = allDates.reduce((a, b) => (a < b ? a : b));
  const max = allDates.reduce((a, b) => (a > b ? a : b));

  const range = [];
  let cursor = min;
  while (cursor <= max) {
    range.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return range;
}

// ---------- rendering ----------

function render() {
  const entries = loadEntries();
  const phases = loadPhases();

  const input = document.getElementById('weight-input');
  if (!input.value && entries.length > 0) {
    const mostRecent = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    input.placeholder = String(mostRecent.weight);
  }

  const labels = buildDateRange(entries, phases);
  const entryByDate = Object.fromEntries(entries.map((e) => [e.date, e.weight]));

  const actualData = labels.map((d) => entryByDate[d] ?? null);
  const goalData = labels.map((d) => goalWeightForDate(phases, d));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Actual',
          data: actualData,
          borderColor: '#1C2321',
          backgroundColor: '#1C2321',
          spanGaps: false,
          pointRadius: 3,
          pointHoverRadius: 4,
          borderWidth: 1.5,
          tension: 0,
        },
        {
          label: 'Goal',
          data: goalData,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          spanGaps: false,
          tension: 0,
          // Colors each drawn segment by which phase governs it — the chart
          // itself shows the piecewise structure instead of a flat line.
          segment: {
            borderColor: (segCtx) => {
              const date = labels[segCtx.p0DataIndex];
              const phase = findPhase(phases, date);
              return phase ? PHASE_COLORS[phase.type] ?? '#999' : '#999';
            },
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion ? false : { duration: 350 },
      scales: {
        x: {
          ticks: { maxTicksLimit: 7, color: '#6B716C', font: { family: 'IBM Plex Mono', size: 11 } },
          grid: { color: '#D8D6CE' },
        },
        y: {
          ticks: { color: '#6B716C', font: { family: 'IBM Plex Mono', size: 11 } },
          grid: { color: '#D8D6CE' },
        },
      },
      plugins: {
        legend: { display: false }, // custom legend rendered in HTML instead
      },
    },
  };

  if (chart) {
    chart.data = config.data;
    chart.update();
  } else {
    chart = new Chart(document.getElementById('chart'), config);
  }
}

// ---------- handlers ----------

function handleSave() {
  const input = document.getElementById('weight-input');
  const feedback = document.getElementById('save-feedback');
  const raw = input.value.trim() !== '' ? input.value : input.placeholder;
  const weight = parseFloat(raw);

  if (!raw || Number.isNaN(weight) || weight <= 0) {
    feedback.textContent = 'Enter a valid number first.';
    return;
  }

  const today = localDateStr();
  const entries = loadEntries();
  const existingIdx = entries.findIndex((e) => e.date === today);

  if (existingIdx >= 0) {
    entries[existingIdx].weight = weight;
  } else {
    entries.push({ date: today, weight });
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  saveEntries(entries);

  input.value = '';
  input.placeholder = String(weight);
  feedback.textContent = existingIdx >= 0 ? 'Updated today\u2019s entry.' : 'Saved.';
  render();
}

function handleSavePhases() {
  const textarea = document.getElementById('phases-json');
  const feedback = document.getElementById('phases-feedback');

  let parsed;
  try {
    parsed = JSON.parse(textarea.value);
    if (!Array.isArray(parsed)) throw new Error('top level must be an array');
  } catch (err) {
    feedback.textContent = `Invalid JSON: ${err.message}`;
    return;
  }

  savePhases(parsed);
  feedback.textContent = 'Phases saved.';

  try {
    render();
  } catch (err) {
    // Data was saved fine — this is a rendering problem, not a JSON problem.
    feedback.textContent = `Saved, but the chart failed to draw: ${err.message}`;
  }
}

// ---------- wire up ----------

document.getElementById('save-btn').addEventListener('click', handleSave);
document.getElementById('weight-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSave();
});
document.getElementById('save-phases-btn').addEventListener('click', handleSavePhases);
document.getElementById('phases-json').value = JSON.stringify(loadPhases(), null, 2);

render();