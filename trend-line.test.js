import assert from 'node:assert';
import { averageWeight, findPhase, goalWeightForDate, isValidDateStr } from './trend-line.js';

// --- fake daily entries, six days leading into a phase start ---
const entries = [
  { date: '2025-12-27', weight: 181.2 },
  { date: '2025-12-28', weight: 180.8 },
  { date: '2025-12-29', weight: 181.5 },
  { date: '2025-12-30', weight: 180.9 },
  { date: '2025-12-31', weight: 181.0 },
  { date: '2026-01-01', weight: 180.6 },
];

// --- averageWeight ---
const avg = averageWeight(entries, '2026-01-01'); // 7-day window, only 6 entries exist
assert.strictEqual(avg, 181.0, `expected 181.0, got ${avg}`);
console.log('PASS: averageWeight with partial window ->', avg);

const avgEmpty = averageWeight(entries, '2025-01-01'); // way before any entries
assert.strictEqual(avgEmpty, null);
console.log('PASS: averageWeight with no data in window -> null');

// --- phases, deliberately including a gap and an open-ended phase ---
const phases = [
  {
    startDate: '2026-01-01',
    endDate: '2026-03-01',
    type: 'bulk',
    weeklyRate: 0.25,
    startWeight: avg, // auto-filled from the average above
  },
  {
    // gap: 2026-03-02 through 2026-03-14 belongs to no phase
    startDate: '2026-03-15',
    endDate: null, // open-ended: still ongoing
    type: 'cut',
    weeklyRate: -0.5,
    startWeight: 184, // manually overwritten, not auto-filled
  },
];

// day 0 of phase 1: goal should equal its startWeight exactly
assert.strictEqual(goalWeightForDate(phases, '2026-01-01'), 181.0);
console.log('PASS: day 0 of phase equals startWeight');

// 7 days into phase 1: +0.25 (one full week at the weekly rate)
assert.strictEqual(goalWeightForDate(phases, '2026-01-08'), 181.25);
console.log('PASS: 7 days in -> +0.25');

// before phase 1 starts
assert.strictEqual(goalWeightForDate(phases, '2025-12-31'), null);
console.log('PASS: before first phase -> null');

// inside the gap between phases
assert.strictEqual(goalWeightForDate(phases, '2026-03-05'), null);
console.log('PASS: inside gap between phases -> null');

// open-ended phase, 17 days after its start
const expected = 184 + 17 * (-0.5 / 7);
const got = goalWeightForDate(phases, '2026-04-01');
assert.strictEqual(got, Math.round(expected * 100) / 100);
console.log('PASS: open-ended phase, 17 days in ->', got);

// --- overlap handling: a phase started in error while another is active ---
const overlapping = [
  { startDate: '2026-01-01', endDate: '2026-03-01', type: 'bulk', weeklyRate: 0.25, startWeight: 180 },
  { startDate: '2026-02-01', endDate: null, type: 'cut', weeklyRate: -0.5, startWeight: 190 },
];
// on 2026-02-15, both phases technically "cover" the date; latest startDate wins
const overlapResult = findPhase(overlapping, '2026-02-15');
assert.strictEqual(overlapResult.startDate, '2026-02-01');
console.log('PASS: overlap resolved to latest-starting phase');

console.log('\nAll tests passed.');

// --- isValidDateStr ---
assert.strictEqual(isValidDateStr('2026-01-01'), true);
console.log('PASS: isValidDateStr accepts a real date');

assert.strictEqual(isValidDateStr('YYYY-MM-DD'), false);
console.log('PASS: isValidDateStr rejects placeholder text');

assert.strictEqual(isValidDateStr('2026-13-01'), false);
console.log('PASS: isValidDateStr rejects an impossible month');

assert.strictEqual(isValidDateStr('2026-1-1'), false);
console.log('PASS: isValidDateStr rejects non-zero-padded dates');
