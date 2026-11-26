(function () {
  'use strict';
  var P = window.KhottaPlan, KEY = 'khotta.v1';
  var COLORS = ['#e2493b', '#2f6fed', '#1f9d6b', '#9b5de5', '#f08a24', '#0e9aa7', '#c2185b', '#6d4c41'];
  var state, tab = 'exams', editingId = null, hoursTouched = false;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function todayStr() { return P.fmtDate(new Date()); }
  function t(k, vars) {
    var s = (window.I18N[state.lang] || window.I18N.ar)[k]; if (s == null) s = k;
    if (vars) Object.keys(vars).forEach(function (v) { s = s.replace('{' + v + '}', vars[v]); });
    return s;
  }
  function num(n) { return state.lang === 'ar' ? String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(n); }

  function defaults() {
    return { v: 1, lang: (navigator.language || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'ar', exams: [], blocks: [],
      settings: { days: [0, 1, 2, 3, 4, 6], hoursPerDay: 3, startHour: 17 } };
  }
  function sanitize(d) {
    var base = defaults();
    if (!d || typeof d !== 'object') return base;
    var out = base;
    out.lang = d.lang === 'en' ? 'en' : (d.lang === 'ar' ? 'ar' : base.lang);
    var s = d.settings || {};
    if (Array.isArray(s.days)) out.settings.days = s.days.filter(function (x) { return x === (x | 0) && x >= 0 && x <= 6; });
    if (typeof s.hoursPerDay === 'number' && s.hoursPerDay >= 0.5 && s.hoursPerDay <= 10) out.settings.hoursPerDay = s.hoursPerDay;
    if (typeof s.startHour === 'number' && s.startHour >= 5 && s.startHour <= 22) out.settings.startHour = s.startHour;
    (Array.isArray(d.exams) ? d.exams : []).forEach(function (e) {
      if (!e || typeof e.name !== 'string' || !P.validDate(e.date)) return;
      var h = +e.hours; if (!(h >= 1 && h <= 200)) h = P.defaultHours(2);
      out.exams.push({ id: String(e.id || uid()), name: e.name.slice(0, 40), date: e.date, time: /^\d{2}:\d{2}$/.test(e.time) ? e.time : '09:00', diff: [1, 2, 3].indexOf(+e.diff) >= 0 ? +e.diff : 2, hours: h });
    });
    (Array.isArray(d.blocks) ? d.blocks : []).forEach(function (b) {
      if (!b || !P.validDate(b.date) || !out.exams.some(function (e) { return e.id === b.examId; }) || !(b.mins > 0)) return;
      out.blocks.push({ id: String(b.id || uid()), date: b.date, examId: b.examId, mins: +b.mins, done: !!b.done });
    });
    return out;
  }
  function load() { try { state = sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { state = defaults(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ } }
  var lastGen = { shortfall: {}, freeDays: 0 };
  function regen(quiet) {
    var g = P.regenerate(state.exams, state.settings, todayStr(), state.blocks);
    state.blocks = g.blocks; lastGen = g; save(); if (!quiet) toast(t('toastRegen'));
  }
  function examColor(id) { var i = state.exams.findIndex(function (e) { return e.id === id; }); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }
  function examById(id) { return state.exams.filter(function (e) { return e.id === id; })[0]; }

  var toastT;
  function toast(m) { var x = $('toast'); x.textContent = m; x.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { x.classList.remove('on'); }, 2200); }

  function applyLang() {
    document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = state.lang === 'ar' ? 'خطة · Khotta' : 'Khotta · خطة';
    $('langBtn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
    document.querySelectorAll('[data-i]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i')); });
  }

  /* ---------- exams view ---------- */
  function relLabel(e) {
    var d = P.diffDays(todayStr(), e.date);
    if (d < 0) return t('over'); if (d === 0) return t('today'); if (d === 1) return t('tomorrow'); return t('inDays', { n: num(d) });
  }
  function fmtDateLong(ds) {
    try { return P.parseDate(ds).toLocaleDateString(state.lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long' }); } catch (e) { return ds; }
  }
  function box(val, label) { var b = el('div', 'tile'); b.appendChild(el('b', 'num', val)); b.appendChild(el('small', null, label)); return b; }
  function renderHero() {
    var h = $('hero'); h.textContent = '';
    var upcoming = P.sortExams(state.exams).filter(function (e) { return !P.countdown(e, new Date()).over; });
    if (!upcoming.length) {
      h.className = 'hero empty'; h.appendChild(el('div', 'big', '📚')); h.appendChild(el('h3', null, t('emptyHero'))); h.appendChild(el('p', null, t('emptyHeroSub'))); return;
    }
    var e = upcoming[0]; h.className = 'hero'; h.style.setProperty('--c', examColor(e.id));
    h.appendChild(el('small', 'kicker', t('next')));
    h.appendChild(el('h3', null, e.name));
    h.appendChild(el('p', 'when', fmtDateLong(e.date) + ' · ' + e.time));
    var g = el('div', 'tiles'); g.id = 'heroTiles'; g.setAttribute('data-exam', e.id);
    ['days', 'hours', 'minutes', 'seconds'].forEach(function (k) { var b = box('0', t(k)); b.setAttribute('data-k', k); g.appendChild(b); });
    h.appendChild(g); tick();
  }
  function tick() {
    var g = $('heroTiles'); if (!g) return;
    var e = examById(g.getAttribute('data-exam')); if (!e) return;
    var c = P.countdown(e, new Date());
    if (c.over) { renderAll(); return; }
    g.querySelectorAll('.tile').forEach(function (b) { var k = b.getAttribute('data-k'); b.firstChild.textContent = num(k === 'days' ? c.days : (c[k] < 10 ? '0' + c[k] : c[k])); });
    document.querySelectorAll('[data-cd]').forEach(function (n) {
      var ex = examById(n.getAttribute('data-cd')); if (!ex) return;
      var cc = P.countdown(ex, new Date());
      n.textContent = cc.over ? t('over') : num(cc.days) + (state.lang === 'ar' ? ' ي ' : 'd ') + num(cc.hours) + (state.lang === 'ar' ? ' س ' : 'h ') + num(cc.minutes) + (state.lang === 'ar' ? ' د' : 'm');
    });
  }
  function renderList() {
    var L = $('examList'); L.textContent = '';
    P.sortExams(state.exams).forEach(function (e) {
      var c = P.countdown(e, new Date());
      var card = el('article', 'exam' + (c.over ? ' past' : '')); card.style.setProperty('--c', examColor(e.id));
      var top = el('div', 'etop');
      var info = el('div', 'einfo'); info.appendChild(el('h4', null, e.name)); info.appendChild(el('small', null, fmtDateLong(e.date) + ' · ' + e.time + ' · ' + relLabel(e)));
      top.appendChild(info);
      var cd = el('span', 'chip', ''); cd.setAttribute('data-cd', e.id); top.appendChild(cd);
      card.appendChild(top);
      var pr = P.progress(e, state.blocks);
      var bar = el('div', 'bar'); var fill = el('i'); fill.style.width = pr.pct + '%'; bar.appendChild(fill); card.appendChild(bar);
      card.appendChild(el('small', 'plabel', num(pr.pct) + (state.lang === 'ar' ? '٪ · ' : '% · ') + t('studied') + ' ' + P.fmtMins(pr.doneMins, state.lang) + ' ' + t('of') + ' ' + P.fmtMins(pr.totalMins, state.lang)));
      var act = el('div', 'eact');
      var b1 = el('button', 'link', t('edit')); b1.type = 'button'; b1.setAttribute('data-edit', e.id);
      var b2 = el('button', 'link red', t('del')); b2.type = 'button'; b2.setAttribute('data-del', e.id);
      act.appendChild(b1); act.appendChild(b2); card.appendChild(act); L.appendChild(card);
    });
    tick();
  }

  /* ---------- plan view ---------- */
  function renderPlan() {
    var S = $('planSummary'); S.textContent = ''; var D = $('planDays'); D.textContent = '';
    var tdy = todayStr();
    var pending = state.blocks.filter(function (b) { return b.date >= tdy || b.done; });
    if (!state.exams.length || !state.blocks.length) {
      S.appendChild(el('div', 'card center', t('planEmpty')));
      var sf0 = Object.keys(lastGen.shortfall || {}); if (state.exams.length && sf0.length) renderShort(S);
      return;
    }
    var totalMins = state.blocks.reduce(function (s, b) { return s + b.mins; }, 0);
    var days = {}; state.blocks.forEach(function (b) { days[b.date] = 1; });
    var st = el('div', 'stats');
    var s1 = el('div', 'stat'); s1.appendChild(el('b', null, num(Math.round(totalMins / 6) / 10))); s1.appendChild(el('small', null, t('totalPlanned')));
    var s2 = el('div', 'stat'); s2.appendChild(el('b', null, num(Object.keys(days).length))); s2.appendChild(el('small', null, t('studyDaysCount')));
    st.appendChild(s1); st.appendChild(s2); S.appendChild(st);
    renderShort(S);
    // today
    var todayBlocks = state.blocks.filter(function (b) { return b.date === tdy; });
    var tc = el('div', 'card today'); tc.appendChild(el('h3', null, t('todayTitle')));
    if (!todayBlocks.length) tc.appendChild(el('p', 'hint', t('nothingToday'))); else todayBlocks.forEach(function (b) { tc.appendChild(blockRow(b)); });
    D.appendChild(tc);
    var dates = Object.keys(days).filter(function (d) { return d !== tdy && d > tdy; }).sort();
    dates.forEach(function (d) {
      var c = el('div', 'day'); var head = el('h4', null, fmtDateLong(d)); c.appendChild(head);
      state.blocks.filter(function (b) { return b.date === d; }).forEach(function (b) { c.appendChild(blockRow(b)); });
      D.appendChild(c);
    });
  }
  function renderShort(S) {
    var keys = Object.keys(lastGen.shortfall || {});
    if (!keys.length) { if (state.blocks.length) S.appendChild(el('p', 'ok', '✓ ' + t('allFits'))); return; }
    keys.forEach(function (id) { var e = examById(id); if (e) S.appendChild(el('p', 'warn', '⚠ ' + t('shortfall', { t: P.fmtMins(lastGen.shortfall[id], state.lang), n: e.name }))); });
  }
  function blockRow(b) {
    var e = examById(b.examId); var r = el('label', 'blk' + (b.done ? ' done' : '')); r.style.setProperty('--c', examColor(b.examId));
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = b.done; cb.setAttribute('data-blk', b.id); r.appendChild(cb);
    r.appendChild(el('span', 'dot')); r.appendChild(el('span', 'bn', e ? e.name : '?')); r.appendChild(el('span', 'bm', P.fmtMins(b.mins, state.lang)));
    return r;
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    var C = $('dayChips'); C.textContent = '';
    var order = state.lang === 'ar' ? [6, 0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0];
    order.forEach(function (d) {
      var b = el('button', 'chipbtn' + (state.settings.days.indexOf(d) >= 0 ? ' on' : ''), t('wdShort')[d]); b.type = 'button'; b.setAttribute('data-day', d);
      b.setAttribute('aria-pressed', state.settings.days.indexOf(d) >= 0 ? 'true' : 'false'); C.appendChild(b);
    });
    $('hpd').value = state.settings.hoursPerDay; $('hpdOut').textContent = num(state.settings.hoursPerDay);
    $('sh').value = state.settings.startHour; $('shOut').textContent = num(state.settings.startHour) + ':00';
  }

  function renderAll() { applyLang(); renderHero(); renderList(); renderPlan(); renderSettings(); }
  function setTab(n) {
    tab = n; ['exams', 'plan', 'settings'].forEach(function (k) { $('v-' + k).hidden = k !== n; });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === n); });
    window.scrollTo(0, 0);
  }

  /* ---------- modal ---------- */
  function openModal(id) {
    editingId = id || null; var e = id ? examById(id) : null;
    $('mTitle').textContent = t(e ? 'editExam' : 'newExam'); $('fErr').textContent = '';
    $('fName').value = e ? e.name : ''; $('fDate').value = e ? e.date : P.addDays(todayStr(), 14); $('fTime').value = e ? e.time : '09:00';
    $('fDate').min = P.addDays(todayStr(), 1);
    var diff = e ? e.diff : 2; document.querySelector('#fDiff input[value="' + diff + '"]').checked = true;
    $('fHours').value = e ? e.hours : P.defaultHours(2); hoursTouched = !!e;
    $('modal').hidden = false; setTimeout(function () { $('fName').focus(); }, 30);
  }
  function closeModal() { $('modal').hidden = true; }
  function submitExam(ev) {
    ev.preventDefault();
    var name = $('fName').value.trim(), date = $('fDate').value, time = $('fTime').value || '09:00', hours = parseFloat($('fHours').value);
    var diff = +document.querySelector('#fDiff input:checked').value, err = '';
    if (!name) err = t('errName'); else if (!P.validDate(date)) err = t('errDate');
    else if (!editingId && P.diffDays(todayStr(), date) < 1) err = t('errPast');
    else if (!(hours >= 1 && hours <= 200)) err = t('errHours');
    if (err) { $('fErr').textContent = err; return; }
    if (editingId) { var e = examById(editingId); e.name = name; e.date = date; e.time = time; e.diff = diff; e.hours = hours; }
    else state.exams.push({ id: uid(), name: name, date: date, time: time, diff: diff, hours: hours });
    regen(true); closeModal(); renderAll(); toast(t('toastSaved'));
  }

  /* ---------- data ---------- */
  function download(name, text, type) {
    var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function addSample() {
    var n = t('sampleNames'); var d = todayStr(); var offs = [9, 15, 22], diffs = [3, 2, 2];
    n.forEach(function (name, i) { state.exams.push({ id: uid(), name: name, date: P.addDays(d, offs[i]), time: '10:00', diff: diffs[i], hours: P.defaultHours(diffs[i]) }); });
    regen(true); renderAll(); toast(t('toastSample'));
  }

  function bind() {
    $('langBtn').onclick = function () { state.lang = state.lang === 'ar' ? 'en' : 'ar'; save(); renderAll(); };
    document.querySelectorAll('.tabs button').forEach(function (b) { b.onclick = function () { setTab(b.getAttribute('data-tab')); }; });
    $('addBtn').onclick = function () { openModal(); };
    $('cancelBtn').onclick = closeModal; $('examForm').addEventListener('submit', submitExam);
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
    document.querySelectorAll('#fDiff input').forEach(function (r) { r.onchange = function () { if (!hoursTouched) $('fHours').value = P.defaultHours(+r.value); }; });
    $('fHours').addEventListener('input', function () { hoursTouched = true; });
    $('examList').addEventListener('click', function (e) {
      var ed = e.target.getAttribute('data-edit'), dl = e.target.getAttribute('data-del');
      if (ed) openModal(ed);
      if (dl && confirm(t('confirmDel'))) { state.exams = state.exams.filter(function (x) { return x.id !== dl; }); state.blocks = state.blocks.filter(function (b) { return b.examId !== dl; }); regen(true); renderAll(); toast(t('toastDel')); }
    });
    $('planDays').addEventListener('change', function (e) {
      var id = e.target.getAttribute('data-blk'); if (!id) return;
      var b = state.blocks.filter(function (x) { return x.id === id; })[0]; if (!b) return;
      b.done = e.target.checked; save(); renderList(); renderPlan();
    });
    $('regenBtn').onclick = function () { regen(false); renderAll(); };
    $('icsBtn').onclick = function () {
      if (!state.exams.length) return;
      download('khotta-plan.ics', P.toICS(state.exams, state.blocks.filter(function (b) { return !b.done || b.date >= todayStr(); }), state.settings.startHour), 'text/calendar'); toast(t('toastIcs'));
    };
    $('printBtn').onclick = function () { window.print(); };
    $('dayChips').addEventListener('click', function (e) {
      var d = e.target.getAttribute('data-day'); if (d == null) return; d = +d; var a = state.settings.days, i = a.indexOf(d);
      if (i >= 0) a.splice(i, 1); else a.push(d); a.sort(); regen(true); renderAll();
    });
    $('hpd').addEventListener('input', function () { state.settings.hoursPerDay = parseFloat($('hpd').value); $('hpdOut').textContent = num(state.settings.hoursPerDay); });
    $('hpd').addEventListener('change', function () { regen(true); renderAll(); });
    $('sh').addEventListener('input', function () { state.settings.startHour = +$('sh').value; $('shOut').textContent = num(state.settings.startHour) + ':00'; });
    $('sh').addEventListener('change', function () { save(); });
    $('sampleBtn').onclick = addSample;
    $('expBtn').onclick = function () { download('khotta-backup.json', JSON.stringify(state, null, 1), 'application/json'); };
    $('impBtn').onclick = function () { $('impFile').click(); };
    $('impFile').onchange = function () {
      var f = $('impFile').files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () {
        try { var d = JSON.parse(r.result); if (!d || !Array.isArray(d.exams)) throw 0; var lang = state.lang; state = sanitize(d); state.lang = lang; regen(true); renderAll(); toast(t('toastImp')); }
        catch (e) { toast(t('toastBad')); }
      };
      r.readAsText(f); $('impFile').value = '';
    };
    $('resetBtn').onclick = function () { if (confirm(t('confirmReset'))) { var l = state.lang; state = defaults(); state.lang = l; lastGen = { shortfall: {}, freeDays: 0 }; save(); renderAll(); } };
    setInterval(tick, 1000);
  }

  if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost)/.test(location.href)) navigator.serviceWorker.register('sw.js').catch(function () {});
  load(); regen(true); bind(); renderAll(); setTab('exams');
  window.__khotta = { get state() { return state; } };
})();
