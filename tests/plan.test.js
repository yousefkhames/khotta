const assert = require('assert'); const P = require('../plan.js');
let n = 0; function t(name, f) { f(); n++; console.log('ok', name); }
const S = { days: [0,1,2,3,4,5,6], hoursPerDay: 3 };
const T = '2026-12-01'; // a Tuesday
t('date helpers', () => { assert.strictEqual(P.addDays('2026-12-31', 1), '2027-01-01'); assert.strictEqual(P.diffDays('2026-12-01', '2026-12-25'), 24); assert(!P.validDate('2026-02-30')); assert(P.validDate('2028-02-29')); });
t('countdown', () => { const c = P.countdown({ date: '2026-12-03', time: '10:30' }, new Date(2026, 11, 1, 9, 0, 0)); assert.deepStrictEqual([c.days, c.hours, c.minutes, c.over], [2, 1, 30, false]); assert(P.countdown({ date: '2026-12-01', time: '08:00' }, new Date(2026, 11, 1, 9, 0, 0)).over); });
t('single exam fully planned', () => { const g = P.generate([{ id: 'a', date: '2026-12-08', diff: 2, hours: 10 }], S, T, []); const sum = g.blocks.reduce((s, b) => s + b.mins, 0); assert.strictEqual(sum, 600); assert.deepStrictEqual(g.shortfall, {}); });
t('never on or after exam date', () => { const g = P.generate([{ id: 'a', date: '2026-12-05', diff: 2, hours: 8 }], S, T, []); assert(g.blocks.every(b => b.date < '2026-12-05' && b.date >= T)); });
t('respects chosen weekdays', () => { const g = P.generate([{ id: 'a', date: '2026-12-20', diff: 2, hours: 10 }], { days: [1, 3], hoursPerDay: 2 }, T, []); assert(g.blocks.every(b => [1, 3].includes(P.parseDate(b.date).getDay()))); });
t('daily capacity respected', () => { const g = P.generate([{ id: 'a', date: '2026-12-10', diff: 3, hours: 12 }, { id: 'b', date: '2026-12-12', diff: 2, hours: 10 }], S, T, []); const per = {}; g.blocks.forEach(b => per[b.date] = (per[b.date] || 0) + b.mins); Object.values(per).forEach(m => assert(m <= 180)); });
t('shortfall reported when impossible', () => { const g = P.generate([{ id: 'a', date: '2026-12-03', diff: 3, hours: 16 }], S, T, []); assert.strictEqual(g.shortfall.a, 960 - 180 * 2); });
t('earlier exam gets priority, both covered', () => { const g = P.generate([{ id: 'a', date: '2026-12-04', diff: 2, hours: 6 }, { id: 'b', date: '2026-12-15', diff: 2, hours: 10 }], S, T, []); const m = { a: 0, b: 0 }; g.blocks.forEach(b => m[b.examId] += b.mins); assert.strictEqual(m.a, 360); assert.strictEqual(m.b, 600); assert.deepStrictEqual(g.shortfall, {}); });
t('past or zero-hour exams ignored', () => { const g = P.generate([{ id: 'a', date: '2026-11-20', diff: 2, hours: 5 }, { id: 'z', date: '2026-12-09', diff: 1, hours: 0 }], S, T, []); assert.strictEqual(g.blocks.length, 0); });
t('same-day exam not studied that day', () => { const g = P.generate([{ id: 'a', date: T, diff: 2, hours: 5 }], S, T, []); assert.strictEqual(g.blocks.length, 0); });
t('regenerate keeps done blocks and counts them', () => { const ex = [{ id: 'a', date: '2026-12-10', diff: 2, hours: 6 }]; const g1 = P.regenerate(ex, S, T, []); g1.blocks[0].done = true; const doneMins = g1.blocks[0].mins; const g2 = P.regenerate(ex, S, T, g1.blocks); const total = g2.blocks.reduce((s, b) => s + b.mins, 0); assert.strictEqual(total, 360); assert(g2.blocks.some(b => b.done && b.mins === doneMins)); });
t('removed exam drops its done blocks', () => { const g = P.regenerate([], S, T, [{ id: 'x', date: T, examId: 'gone', mins: 60, done: true }]); assert.strictEqual(g.blocks.length, 0); });
t('progress', () => { const p = P.progress({ id: 'a', hours: 4 }, [{ examId: 'a', mins: 60, done: true }, { examId: 'a', mins: 60, done: false }]); assert.deepStrictEqual([p.doneMins, p.plannedMins, p.pct], [60, 120, 25]); });
t('fmtMins', () => { assert.strictEqual(P.fmtMins(90, 'en'), '1h 30m'); assert.strictEqual(P.fmtMins(60, 'en'), '1h'); assert.strictEqual(P.fmtMins(30, 'en'), '30m'); });
t('ics valid structure and escaping', () => { const ex = [{ id: 'a', name: 'Math, 1; "x"', date: '2026-12-10', time: '09:00' }]; const ics = P.toICS(ex, [{ id: 'b1', date: '2026-12-05', examId: 'a', mins: 90 }], 17); assert(ics.startsWith('BEGIN:VCALENDAR') && ics.endsWith('END:VCALENDAR')); assert(ics.includes('DTSTART:20261205T170000') && ics.includes('DTEND:20261205T183000')); assert(ics.includes('Math\\, 1\\; "x"')); assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 2); });
t('deterministic', () => { const ex = [{ id: 'a', date: '2026-12-10', diff: 3, hours: 12 }, { id: 'b', date: '2026-12-12', diff: 1, hours: 5 }]; assert.deepStrictEqual(P.generate(ex, S, T, []), P.generate(ex, S, T, [])); });
t('missed sessions are rescheduled on a later day', () => { const ex = [{ id: 'a', date: '2026-12-12', diff: 2, hours: 6 }]; const g1 = P.regenerate(ex, S, T, []); const g2 = P.regenerate(ex, S, '2026-12-05', g1.blocks); assert.strictEqual(g2.blocks.reduce((s, b) => s + b.mins, 0), 360); assert(g2.blocks.every(b => b.date >= '2026-12-05')); });
t('fuzz invariants (500 random scenarios)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 500; i++) {
    const ne = 1 + Math.floor(rnd() * 6), exams = [];
    for (let j = 0; j < ne; j++) exams.push({ id: 'e' + j, date: P.addDays(T, Math.floor(rnd() * 40) - 3), diff: 1 + Math.floor(rnd() * 3), hours: Math.floor(rnd() * 30) });
    const days = [0,1,2,3,4,5,6].filter(() => rnd() > 0.35), hpd = 0.5 + Math.floor(rnd() * 12) / 2;
    const g = P.generate(exams, { days, hoursPerDay: hpd }, T, []);
    const per = {}, got = {};
    g.blocks.forEach(b => { per[b.date] = (per[b.date] || 0) + b.mins; got[b.examId] = (got[b.examId] || 0) + b.mins;
      const e = exams.find(x => x.id === b.examId); assert(b.date >= T && b.date < e.date); assert(days.includes(P.parseDate(b.date).getDay())); assert(b.mins % 30 === 0 && b.mins > 0); });
    Object.values(per).forEach(m => assert(m <= Math.floor(hpd * 2) * 30));
    exams.forEach(e => { const want = Math.round(e.hours * 2) * 30, have = got[e.id] || 0; const live = P.diffDays(T, e.date) > 0 && e.hours > 0;
      if (!live) assert.strictEqual(have, 0); else assert.strictEqual(have + (g.shortfall[e.id] || 0), want); });
  }
});
console.log(n + ' tests passed');
