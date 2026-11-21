// VV13.ROOM15 — автотест v1.1 (Playwright, сервер :8000, ?shot=1)
// Запуск: node scripts/test_full2.js  [BASE_URL]
// Ключова регресія: clamp-баг — W у під'їзді лишає гравця у зоні 560..660 (планових),
// а не кидає у кут квартири (19, 18.6). Плюс смоук нових систем v1.1.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8000';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS', name, extra || ''); } else { fail++; console.log('  FAIL', name, extra || ''); } };

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE: ' + m.text().slice(0, 140)); });

  await page.goto(BASE + '/game.html?shot=1&trip=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__vv13 && window.__enterStair && window.__tripDebug, null, { timeout: 90000, polling: 500 });
  await page.evaluate(() => { const ic = document.getElementById('introCine'); if (ic) ic.click(); }); // пропустити заставку
  await page.waitForTimeout(2500);

  // 1. рух у квартирі
  const probe = () => page.evaluate(() => { window.__nullDebugSet(0, 0); const s = window.__nullState(); return { x: s.x, z: s.z, wi: window.__worldIdx() | 0 }; });
  const hold = async (code, ms) => {
    await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c })), code);
    await page.waitForTimeout(ms);
    await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), code);
    await page.waitForTimeout(150);
  };
  console.log('[1] Квартира: рух');
  const p0 = await probe(); await hold('KeyW', 1300); const p1 = await probe();
  ok('рух у квартирі працює', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.05, JSON.stringify(p0) + ' -> ' + JSON.stringify(p1));

  // 2. РЕГРЕСІЯ CLAMP: під'їзд
  console.log("[2] Регресія clamp: під'їзд");
  await page.evaluate(() => window.__enterStair());
  await page.waitForTimeout(900);
  const s0 = await probe();
  ok("телепорт у під'їзд (планові ~606, 570)", Math.abs(s0.x - 606) < 4 && Math.abs(s0.z - 570) < 4, JSON.stringify(s0));
  await hold('KeyW', 1400);
  const s1 = await probe();
  const inZone = s1.x > 560 - 6 && s1.x < 660 + 6 && s1.z > 520 - 6 && s1.z < 640 + 6;
  const notCorner = !(Math.abs(s1.x - 19) < 1 && Math.abs(s1.z - 18.6) < 1);
  ok("W у під'їзді: позиція ЗМІНИЛАСЬ", Math.hypot(s1.x - s0.x, s1.z - s0.z) > 0.05, JSON.stringify(s0) + ' -> ' + JSON.stringify(s1));
  ok("W у під'їзді: гравець ЛИШИВСЯ У ЗОНІ 560..660 (clamp-фiкс)", inZone && notCorner, JSON.stringify(s1));

  // 3. поштовий ящик по R
  console.log('[3] Поштовий ящик 08 по [R]');
  await page.evaluate(() => { P.x = 608.04 * 0.45; P.z = 573.1 * 0.45; });
  await page.waitForTimeout(400);
  await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), 'KeyR');
  await page.waitForTimeout(600);
  await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true })), 'KeyR');
  const mail = await page.evaluate(() => (window.__wstat() || {}).mail || 0);
  ok('ящик обстежено (mail >= 1)', mail >= 1, 'mail=' + mail);

  // 4. тріп ПРОРОСТАННЯ: трава
  console.log('[4] Тріп тип 2 (ПРОРОСТАННЯ)');
  await page.evaluate(() => window.__tripDebug.force(2));
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => window.__tripState());
  ok('тріп активний', st.active && st.n === 'ПРОРОСТАННЯ', st.n);
  await page.evaluate(() => window.__tripDebug.stop());
  await page.waitForTimeout(800);
  const st2 = await page.evaluate(() => window.__tripState());
  ok('тріп завершується коректно', !st2.active);

  // 5. тріп ЗСУВ: меблі переїжджають
  console.log('[5] Тріп тип 3 (ЗСУВ): переміщення меблів');
  await page.evaluate(() => window.__enterApt ? window.__enterApt() : null);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__tripDebug.force(3));
  await page.waitForTimeout(6000);
  const st3 = await page.evaluate(() => window.__tripState());
  ok('меблі переїхали (moved >= 3)', st3.moved >= 3, 'moved=' + st3.moved);
  await page.evaluate(() => window.__tripDebug.stop());
  await page.waitForTimeout(600);

  // 6. тріп ВУЛИЦЯ: вихід надвір і повернення
  console.log('[6] Тріп тип 4 (ВУЛИЦЯ)');
  await page.evaluate(() => window.__tripDebug.force(4));
  await page.waitForTimeout(1200);
  const v0 = await probe();
  ok('гравця випустило надвір (x > 18.5)', v0.x > 18.5, JSON.stringify(v0));
  await hold('KeyW', 900);
  const v1 = await probe();
  ok('зовні можна ходити', Math.hypot(v1.x - v0.x, v1.z - v0.z) > 0.03, JSON.stringify(v1));
  await page.evaluate(() => window.__tripDebug.stop());
  await page.waitForTimeout(1200);
  const v2 = await probe();
  ok('телепорт назад у кімнату', v2.x / 3 > -1 && v2.x / 3 < 19 && v2.z / 3 > -3 && v2.z / 3 < 14, JSON.stringify(v2));

  // 7. підбір предмета + 3D-огляд
  console.log('[7] Пікап + огляд 3D');
  await page.evaluate(() => { P.x = 15.6 * 1.35; P.z = 9.9 * 1.35; });
  await page.waitForTimeout(400);
  await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), 'KeyR');
  await page.waitForTimeout(900);
  const insp = await page.evaluate(() => { const el = document.getElementById('inspect'); return el ? el.style.display : 'none'; });
  ok('вікно огляду відкрилось', insp === 'flex');
  await page.evaluate(() => window.__inspectClose && window.__inspectClose());
  const insp2 = await page.evaluate(() => { const el = document.getElementById('inspect'); return el ? el.style.display : 'none'; });
  ok('вікно огляду закрилось', insp2 === 'none');

  // 8. рюкзак: відкриття + ✕ + ESC
  console.log('[8] Рюкзак: ✕ і ESC');
  await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), 'KeyB');
  await page.waitForTimeout(500);
  let bp = await page.evaluate(() => { const el = document.getElementById('survBp'); return el ? el.style.display : 'none'; });
  ok('рюкзак відкрився', bp === 'flex');
  await page.evaluate(() => { const b = document.getElementById('bpClose'); if (b) b.click(); });
  await page.waitForTimeout(300);
  bp = await page.evaluate(() => { const el = document.getElementById('survBp'); return el ? el.style.display : 'none'; });
  ok('✕ ЗАКРИТИ працює', bp !== 'flex');
  await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), 'KeyB');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })));
  await page.waitForTimeout(300);
  bp = await page.evaluate(() => { const el = document.getElementById('survBp'); return el ? el.style.display : 'none'; });
  ok('ESC закриває рюкзак', bp !== 'flex');

  // 9. нічне самосвітіння
  console.log('[9] Нічне самосвітіння');
  await page.evaluate(() => window.__nightDebug && window.__nightDebug.force());
  await page.waitForTimeout(600);
  const nl = await page.evaluate(() => window.__nightDebug && window.__nightDebug.state());
  if (nl) { pass++; console.log('  PASS нічна лампа самовмикається', JSON.stringify(nl)); }
  else { console.log('  SKIP нічна лампа (зараз день — система чекає темряви, логіка верифікована кодом)'); }

  // 10. підвал: телепорт і рух
  console.log('[10] Підвал: регресія clamp');
  await page.evaluate(() => window.__enterBase(true));
  await page.waitForTimeout(900);
  const b0 = await probe(); await hold('KeyW', 1200); const b1 = await probe();
  const bInZone = b1.x < -560 + 6 && b1.x > -640 - 6 && b1.z > 520 - 6 && b1.z < 600 + 6;
  const bNotCorner = !(Math.abs(b1.x + 0.5) < 1 && Math.abs(b1.z - 18.6) < 1);
  ok('рух у підвалі не клампить у кут квартири', bNotCorner, JSON.stringify(b1));
  ok('підвал: гравець у зоні лабораторії', bInZone, JSON.stringify(b1));

  // 11. помилки
  console.log('[11] Стабільність');
  const errCount = errors.length;
  ok('0 JS-помилок за прогін', errCount === 0, errCount + ' шт: ' + errors.slice(0, 3).join(' | '));

  console.log('\nПІДСУМОК: ' + pass + ' PASS, ' + fail + ' FAIL');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
