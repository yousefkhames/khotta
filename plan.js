/* Khotta planning engine. Pure functions, no DOM. Works in browser and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KhottaPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SLOT = 30; // minutes per planning slot

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
  function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    return fmtDate(parseDate(s)) === s;
  }

  var DEFAULT_HOURS = { 1: 6, 2: 10, 3: 16 };
  function defaultHours(diff) { return DEFAULT_HOURS[diff] || 10; }

  /* Countdown parts to the exam moment (date + time, local). */
  function countdown(exam, now) {
    var t = exam.time && /^\d{2}:\d{2}$/.test(exam.time) ? exam.time : '09:00';
    var p = t.split(':');
    var d = parseDate(exam.date); d.setHours(+p[0], +p[1], 0, 0);
    var ms = d - now;
    var over = ms <= 0;
    var s = Math.floor(Math.abs(ms) / 1000);
    return { over: over, ms: ms, days: Math.floor(s / 86400), hours: Math.floor(s % 86400 / 3600), minutes: Math.floor(s % 3600 / 60), seconds: s % 60 };
  }

  function sortExams(exams) {
    return exams.slice().sort(function (a, b) { return (a.date + (a.time || '09:00')).localeCompare(b.date + (b.time || '09:00')); });
  }

  /*
   * generate(exams, settings, today, keptBlocks)
   * exams: [{id, date, diff, hours}]  hours = total study hours wanted
   * settings: {days:[0..6] (JS getDay), hoursPerDay, perDay?:{0..6: hours}, rest:int exam-eve rule}
   * keptBlocks: blocks already done {date, examId, mins} (they count against the need and today's capacity)
   * Returns {blocks:[{id,date,examId,mins,done:false}], shortfall:{examId:mins}, freeDays, totalCapacityMins}
   * Rule: study only on chosen weekdays; never on or after the exam date; each exam gets its
   * remaining minutes spread so the exam with the tightest ratio (need / slots left) goes first.
   */
  function generate(exams, settings, today, keptBlocks) {
    keptBlocks = keptBlocks || [];
    var active = exams.filter(function (e) { return validDate(e.date) && diffDays(today, e.date) > 0 && e.hours > 0; });
    var need = {}; var lastDay = {};
    active.forEach(function (e) {
      var done = 0;
      keptBlocks.forEach(function (b) { if (b.examId === e.id) done += b.mins; });
      need[e.id] = Math.max(0, Math.round(e.hours * 60 / SLOT) * SLOT - done);
      lastDay[e.id] = addDays(e.date, -1);
    });
    var horizon = active.reduce(function (m, e) { return lastDay[e.id] > m ? lastDay[e.id] : m; }, today);
    var days = [];
    var span = diffDays(today, horizon);
    for (var i = 0; i <= span; i++) {
      var ds = addDays(today, i);
      var wd = parseDate(ds).getDay();
      if (settings.days.indexOf(wd) < 0) continue;
      var h = settings.perDay && settings.perDay[wd] != null ? settings.perDay[wd] : settings.hoursPerDay;
      var cap = Math.floor(h * 60 / SLOT) * SLOT;
      keptBlocks.forEach(function (b) { if (b.date === ds) cap -= b.mins; });
      days.push({ date: ds, cap: Math.max(0, cap), slots: [] });
    }
    var totalCap = days.reduce(function (s, d) { return s + d.cap; }, 0);
    // slots available for an exam from day index k to its last day
    function slotsLeft(e, k) {
      var n = 0;
      for (var j = k; j < days.length; j++) if (days[j].date <= lastDay[e.id]) n += days[j].cap / SLOT - days[j].slots.length;
      return n;
    }
    for (var k = 0; k < days.length; k++) {
      var day = days[k];
      var free = day.cap / SLOT;
      var lastPick = null;
      while (day.slots.length < free) {
        var best = null, bestScore = -1;
        active.forEach(function (e) {
          if (need[e.id] <= 0 || day.date > lastDay[e.id]) return;
          var left = slotsLeft(e, k);
          var ratio = (need[e.id] / SLOT) / Math.max(left, 1);
          // slight bias to keep a subject going (fewer context switches), earlier exams win ties
          var score = ratio + (e.id === lastPick ? 0.02 : 0) + (e.diff || 2) * 0.001 - (diffDays(today, e.date)) * 0.00001;
          if (score > bestScore) { bestScore = score; best = e; }
        });
        if (!best) break;
        day.slots.push(best.id); need[best.id] -= SLOT; lastPick = best.id;
      }
    }
    var blocks = []; var n = 0;
    days.forEach(function (d) {
      var order = [], cnt = {};
      d.slots.forEach(function (id) { if (!(id in cnt)) { cnt[id] = 0; order.push(id); } cnt[id] += SLOT; });
      order.forEach(function (id) { blocks.push({ id: 'b' + (n++) + '_' + d.date, date: d.date, examId: id, mins: cnt[id], done: false }); });
    });
    var shortfall = {};
    active.forEach(function (e) { if (need[e.id] > 0) shortfall[e.id] = need[e.id]; });
    return { blocks: blocks, shortfall: shortfall, freeDays: days.filter(function (d) { return d.cap > 0; }).length, totalCapacityMins: totalCap };
  }

  /* Merge a fresh generate() with already-done blocks. */
  function regenerate(exams, settings, today, oldBlocks) {
    var kept = (oldBlocks || []).filter(function (b) { return b.done && exams.some(function (e) { return e.id === b.examId; }); });
    var g = generate(exams, settings, today, kept);
    g.blocks = kept.concat(g.blocks).sort(function (a, b) { return a.date === b.date ? (a.done === b.done ? 0 : a.done ? -1 : 1) : a.date < b.date ? -1 : 1; });
    return g;
  }

  function progress(exam, blocks) {
    var total = Math.round(exam.hours * 60), done = 0, planned = 0;
    blocks.forEach(function (b) { if (b.examId === exam.id) { planned += b.mins; if (b.done) done += b.mins; } });
    return { doneMins: done, plannedMins: planned, totalMins: total, pct: total ? Math.min(100, Math.round(done / total * 100)) : 0 };
  }

  function fmtMins(m, lang) {
    var h = Math.floor(m / 60), r = m % 60;
    if (lang === 'ar') return (h ? h + ' س' : '') + (h && r ? ' و ' : '') + (r ? r + ' د' : (h ? '' : '0 د'));
    return (h ? h + 'h' : '') + (h && r ? ' ' : '') + (r ? r + 'm' : (h ? '' : '0m'));
  }

  /* iCalendar export: one all-day-free timed event per block (09:00 anchor shifted), plus exam events. */
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function toICS(exams, blocks, startHour) {
    startHour = startHour == null ? 17 : startHour;
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Khotta//Study plan//EN', 'CALSCALE:GREGORIAN'];
    var byId = {}; exams.forEach(function (e) { byId[e.id] = e; });
    function stamp(ds, hh, mm) { return ds.replace(/-/g, '') + 'T' + pad(hh) + pad(mm) + '00'; }
    var cursor = {};
    blocks.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function (b) {
      var e = byId[b.examId]; if (!e) return;
      var startMin = cursor[b.date] != null ? cursor[b.date] : startHour * 60;
      var endMin = startMin + b.mins; cursor[b.date] = endMin;
      L.push('BEGIN:VEVENT', 'UID:' + b.id + '@khotta', 'DTSTAMP:20260101T000000Z',
        'DTSTART:' + stamp(b.date, Math.floor(startMin / 60) % 24, startMin % 60),
        'DTEND:' + stamp(b.date, Math.floor(endMin / 60) % 24, endMin % 60),
        'SUMMARY:' + icsEscape('Study: ' + e.name), 'END:VEVENT');
    });
    exams.forEach(function (e) {
      var t = (e.time || '09:00').split(':'); var h = +t[0], m = +t[1];
      L.push('BEGIN:VEVENT', 'UID:exam-' + e.id + '@khotta', 'DTSTAMP:20260101T000000Z',
        'DTSTART:' + stamp(e.date, h, m), 'DTEND:' + stamp(e.date, Math.min(h + 2, 23), m),
        'SUMMARY:' + icsEscape('EXAM: ' + e.name), 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n');
  }

  return { SLOT: SLOT, parseDate: parseDate, fmtDate: fmtDate, addDays: addDays, diffDays: diffDays, validDate: validDate,
    defaultHours: defaultHours, countdown: countdown, sortExams: sortExams, generate: generate, regenerate: regenerate,
    progress: progress, fmtMins: fmtMins, toICS: toICS };
});
