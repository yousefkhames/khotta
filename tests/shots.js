const puppeteer = require('puppeteer-core');
(async () => {
  const BASE = process.env.BASE || 'http://localhost:8099/';
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (await p.evaluate(() => document.documentElement.lang) === 'en') { await p.click('#langBtn'); }
  await p.click('[data-tab=settings]'); await p.click('#sampleBtn'); await wait(2500);
  await p.click('[data-tab=exams]'); await wait(300); await p.screenshot({ path: 'docs/5-ar.png' });
  await p.click('[data-tab=plan]'); await wait(300); await p.screenshot({ path: 'docs/2-plan-ar.png' });
  await p.click('#langBtn'); await p.click('[data-tab=exams]'); await wait(2500); await p.screenshot({ path: 'docs/1-countdown.png' });
  await p.click('[data-tab=plan]'); await wait(300); await p.screenshot({ path: 'docs/2-plan.png' });
  await b.close();
})();
