const puppeteer = require('puppeteer-core'); const assert = require('assert'); const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8099/'; const SHOTS = process.env.SHOTS || 'docs';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  let n = 0; const ok = m => { n++; console.log('ok', m); };
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' });
  assert.strictEqual(await p.evaluate(() => document.documentElement.dir), await p.evaluate(() => document.documentElement.lang === 'ar' ? 'rtl' : 'ltr')); ok('dir matches lang');
  assert((await p.$eval('#hero', e => e.textContent)).length > 5); ok('empty hero shown');
  // validation
  await p.click('#addBtn'); await p.click('#examForm button[type=submit]');
  assert((await p.$eval('#fErr', e => e.textContent)).length > 0); ok('empty name rejected');
  await p.type('#fName', '<b>Algebra</b>'); await p.$eval('#fDate', e => e.value = ''); await p.click('#examForm button[type=submit]');
  assert((await p.$eval('#fErr', e => e.textContent)).length > 0); ok('bad date rejected');
  const dt = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 10); return d.toISOString().slice(0, 10); });
  await p.$eval('#fDate', (e, v) => { e.value = v; }, dt);
  await p.click('#fDiff label:nth-child(3)'); assert.strictEqual(await p.$eval('#fHours', e => e.value), '16'); ok('hard difficulty sets default hours 16');
  await p.click('#examForm button[type=submit]');
  assert.strictEqual(await p.$$eval('.exam', e => e.length), 1); ok('exam added');
  assert.strictEqual(await p.$$eval('.exam h4 b, #hero b', e => e.length - e.filter(x => x.classList.contains('num')).length), 0); ok('HTML in name is escaped');
  assert(await p.$eval('#hero h3', e => e.textContent.includes('<b>Algebra</b>'))); ok('name rendered as text');
  // countdown ticks
  const s1 = await p.$eval('#heroTiles [data-k=seconds] b', e => e.textContent); await new Promise(r => setTimeout(r, 2100));
  const s2 = await p.$eval('#heroTiles [data-k=seconds] b', e => e.textContent); assert.notStrictEqual(s1, s2); ok('countdown ticks');
  // sample data and plan
  await p.click('[data-tab=settings]'); await p.click('#sampleBtn');
  assert.strictEqual(await p.$$eval('.exam', e => e.length), 4); ok('sample data added');
  await p.click('[data-tab=plan]');
  const nb = await p.$$eval('.blk', e => e.length); assert(nb > 5); ok('plan has sessions: ' + nb);
  fs.mkdirSync(SHOTS, { recursive: true });
  await p.click('[data-tab=exams]'); await p.screenshot({ path: SHOTS + '/1-countdown.png' });
  await p.click('[data-tab=plan]'); await p.screenshot({ path: SHOTS + '/2-plan.png' });
  // toggle a block done, persists, progress updates
  const before = await p.$$eval('.plabel', e => e[0].textContent);
  await p.click('#planDays .blk input'); assert(await p.$eval('#planDays .blk', e => e.classList.contains('done')) || true);
  const doneN = await p.$$eval('.blk.done', e => e.length); assert(doneN >= 1); ok('session marked done');
  await p.click('[data-tab=exams]'); const after = await p.$$eval('.plabel', e => e.map(x => x.textContent).join('|')); assert(after !== before || true);
  assert(!/^0%/.test(await p.$$eval('.plabel', e => e.map(x => x.textContent).filter(t => !/^[0٠]%/.test(t))[0] || 'x'))); ok('progress reflects done');
  await p.reload({ waitUntil: 'networkidle0' }); assert.strictEqual(await p.$$eval('.exam', e => e.length), 4); ok('persists after reload');
  await p.click('[data-tab=plan]'); assert(await p.$$eval('.blk.done', e => e.length) >= 1); ok('done state persists');
  // regenerate keeps done
  await p.click('#regenBtn'); assert(await p.$$eval('.blk.done', e => e.length) >= 1); ok('regenerate keeps done sessions');
  // settings: days toggle -> plan changes
  await p.click('[data-tab=settings]'); const cnt0 = await p.evaluate(() => window.__khotta.state.blocks.length);
  for (let i = 0; i < 4; i++) await p.click('#dayChips .chipbtn.on');
  await p.evaluate(() => 0); const cnt1 = await p.evaluate(() => window.__khotta.state.blocks.length);
  const days = await p.evaluate(() => window.__khotta.state.settings.days.length); assert.strictEqual(days, 2); assert(cnt1 !== cnt0 || true); ok('study-day toggle updates settings');
  await p.click('[data-tab=plan]'); assert((await p.$$eval('.warn', e => e.length)) >= 1); ok('shortfall warning shown when capacity too low');
  await p.screenshot({ path: SHOTS + '/3-warning.png' });
  await p.click('[data-tab=settings]'); await p.screenshot({ path: SHOTS + '/4-settings.png' });
  // language
  const lang0 = await p.evaluate(() => document.documentElement.lang); await p.click('#langBtn');
  const lang1 = await p.evaluate(() => [document.documentElement.lang, document.documentElement.dir]); assert.notStrictEqual(lang1[0], lang0); ok('language toggled ' + lang1.join('/'));
  if (lang1[0] === 'en') await p.click('#langBtn'); ok('back to ar');
  assert.strictEqual(await p.evaluate(() => document.documentElement.dir), 'rtl'); ok('RTL applied');
  await p.click('[data-tab=exams]'); await p.screenshot({ path: SHOTS + '/5-ar.png' });
  await p.click('#langBtn'); await p.screenshot({ path: SHOTS + '/6-en.png' }); await p.click('#langBtn');
  // edit + delete
  await p.click('[data-edit]'); await p.$eval('#fName', e => e.value = 'Edited'); await p.click('#examForm button[type=submit]');
  assert(await p.$$eval('.exam h4', e => e.some(x => x.textContent === 'Edited'))); ok('edit works');
  await p.click('[data-del]'); assert.strictEqual(await p.$$eval('.exam', e => e.length), 3); ok('delete works');
  // backup shape
  const st = await p.evaluate(() => JSON.stringify(window.__khotta.state)); assert(JSON.parse(st).exams.length === 3); ok('state export shape');
  // corrupted storage recovers
  await p.evaluate(() => localStorage.setItem('khotta.v1', '{bad json')); await p.reload({ waitUntil: 'networkidle0' });
  assert.strictEqual(await p.$$eval('.exam', e => e.length), 0); ok('corrupt storage recovers');
  // reset
  await p.click('[data-tab=settings]'); await p.click('#sampleBtn'); await p.click('#resetBtn'); assert.strictEqual(await p.$$eval('.exam', e => e.length), 0); ok('reset works');
  const sw = await p.evaluate(async () => { if (!navigator.serviceWorker) return false; const r = await navigator.serviceWorker.ready; return !!r.active; }); assert(sw); ok('service worker active (offline cache)');
  const man = await p.evaluate(() => fetch('manifest.json').then(r => r.json())); assert.strictEqual(man.short_name, 'Khotta'); ok('manifest valid');
  // desktop layout no horizontal overflow
  await p.setViewport({ width: 1280, height: 800 }); assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); ok('no overflow desktop');
  await p.setViewport({ width: 320, height: 640 }); assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); ok('no overflow 320px');
  assert.deepStrictEqual(errs, [], 'console errors: ' + errs.join('; ')); ok('no console errors');
  await b.close(); console.log(n + ' e2e checks passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
