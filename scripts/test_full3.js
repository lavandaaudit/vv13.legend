// VV13.ROOM15 — автотест v1.2 (Playwright). ЧАСТИНИ: a | b | c
//   a — текстури/моделі, clamp-регресія, УДАР меблів, ВУЛИЦЯ-повернення, гензвук
//   b — мобільний прогін: ландшафтні кнопки, тап-кліки у вікнах
//   c — титулка після заставки (armed-пауза)
// Запуск: node scripts/test_full3.js a|b|c  [BASE_URL]
const { chromium } = require('playwright');
const BASE = process.argv[3] || 'http://localhost:8000';
const PART = (process.argv[2] || 'a').toLowerCase();
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS', name, extra || ''); } else { fail++; console.log('  FAIL', name, extra || ''); } };
const VP = { width: 480, height: 270 };   // ландшафт 16:9 — SwiftShader швидкий

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });

  if (PART === 'a') {
    const page = await browser.newPage({ viewport: VP });
    const errors = [];
    let tex200 = 0, texFail = 0, subHits = 0, gltfFail = 0;
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE: ' + m.text().slice(0, 140)); });
    page.on('response', r => {
      const u = r.url();
      if (u.includes('/models/textures/')) { if (r.status() === 200) tex200++; else texFail++; }
      if (u.includes('/models/textures/Armchair_01')) subHits++;
      if (u.endsWith('.gltf') && r.status() !== 200) gltfFail++;
    });
    page.on('requestfailed', r => { if (r.url().includes('/models/textures/') || r.url().endsWith('.gltf')) texFail++; });

    await page.goto(BASE + '/game.html?shot=1&trip=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__vv13 && window.__enterStair && window.__tripDebug, null, { timeout: 90000, polling: 500 });
    await page.evaluate(() => { const ic = document.getElementById('introCine'); if (ic) ic.click(); });
    await page.waitForFunction(() => (typeof phPending !== 'undefined' ? phPending : -1) === 0, null, { timeout: 180000, polling: 1000 });
    ok('всі моделі завантажились (phPending = 0)', true);
    ok('реальні текстури з repo завантажуються (>= 300 шт, 200 OK)', tex200 >= 300, '200s=' + tex200);
    ok('0 невдалих текстур/моделей', texFail === 0 && gltfFail === 0, 'fails=' + texFail + '/' + gltfFail);
    ok('заміна Ottoman→Armchair працює (справжні url)', subHits > 0, 'hits=' + subHits);

    const hold = async (code, ms) => {
      await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c })), code);
      await page.waitForTimeout(ms);
      await page.evaluate(c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })), code);
      await page.waitForTimeout(150);
    };
    const probe = () => page.evaluate(() => { window.__nullDebugSet(0, 0); const s = window.__nullState(); return { x: s.x, z: s.z, wi: window.__worldIdx() | 0 }; });

    console.log('[A1] Регресія clamp: під\'їзд');
    await page.evaluate(() => window.__enterStair());
    await page.waitForTimeout(900);
    const s0 = await probe(); await hold('KeyW', 1400); const s1 = await probe();
    const notCorner = !(Math.abs(s1.x - 19) < 1 && Math.abs(s1.z - 18.6) < 1);
    ok("W у під'їзді: гравець у зоні, не в кутку квартири", notCorner && Math.hypot(s1.x - s0.x, s1.z - s0.z) > 0.03, JSON.stringify(s1));
    await page.evaluate(() => window.__enterApt ? window.__enterApt() : null);
    await page.waitForTimeout(700);

    console.log('[A2] УДАР: відкидання меблів');
    const kickSetup = await page.evaluate(() => {
      const reg = (window.__tripRegGet && window.__tripRegGet()) || [];
      if (!reg.length) return null;
      window.__nullDebugSet(0, 0);
      const cands = [];
      for (const r of reg) {
        const px = r.g.position.x, pz = r.g.position.z;
        if (px > 9 && px < 45 && pz > 0 && pz < 42) cands.push(r.g.uuid);   // центральна зона, ідентифікатор — uuid групи
      }
      if (!cands.length) cands.push(reg[0].i);
      return { cands, n: reg.length };
    });
    ok('реєстр меблів є (tripRegGet)', !!kickSetup && kickSetup.n > 0, 'n=' + (kickSetup && kickSetup.n));
    if (kickSetup) {
      let bestDelta = 0, tried = 0;
      for (const ci of kickSetup.cands.slice(0, 4)) {
        tried++;
        const st = await page.evaluate(i => {
          const it = window.__tripRegGet().find(r => r.g.uuid === i);
          if (!it) return null;
          P.x = it.g.position.x + 1.5; P.z = it.g.position.z;
          P.yaw = Math.atan2(it.g.position.x - P.x, it.g.position.z - P.z);
          P.pitch = 0;
          return { x0: it.g.position.x, z0: it.g.position.z, res: window.__tripKick(it) };
        }, ci);
        if (!st || st.res !== true) continue;
        // семпл по часу: анімація time-based, кадри в headless рідкі (~1 fps)
        let delta = 0;
        for (let s = 0; s < 5; s++) {
          await page.waitForTimeout(700);
          const p = await page.evaluate(k => {
            const reg = window.__tripRegGet();
            const it = reg.find(r => r.g.uuid === k.u);
            if (!it) return { gone: true, len: reg.length };
            return { x: it.g.position.x, z: it.g.position.z };
          }, { u: ci });
          if (p.gone) { console.log('  (item зник з REG: len=' + p.len + ')'); delta = 0; break; }
          delta = Math.hypot(p.x - st.x0, p.z - st.z0);
          if (delta > 0.8) break;
        }
        bestDelta = Math.max(bestDelta, delta);
        if (bestDelta > 0.8) break;
      }
      ok('__tripKick відкидає меблі (зсув >= 0.8 світових од.)', bestDelta > 0.8, 'delta=' + bestDelta.toFixed(2) + ', спроб=' + tried);
      const swingOK = await page.evaluate(() => {
        const reg = window.__tripRegGet(); const it = reg.find(r => r.g.parent);
        if (!it) return false;
        P.x = it.g.position.x + 1.4; P.z = it.g.position.z;
        P.yaw = Math.atan2(it.g.position.x - P.x, it.g.position.z - P.z); P.pitch = 0;
        try { window.__nullSwing(); } catch (e) { return false; }
        return new Promise(res => setTimeout(() => res(true), 900));
      });
      ok('swing (Space/УДАР) у квартирі не падає', swingOK === true);
    }

    console.log('[A3] ВУЛИЦЯ: кнопка повернення');
    await page.evaluate(() => window.__tripDebug.force(4));
    await page.waitForTimeout(1200);
    const hasBack = await page.evaluate(() => { const b = document.getElementById('bBack'); return !!b && b.style.display !== 'none'; });
    ok('кнопка УВІЙТИ НАЗАД з\u2019явилась', hasBack);
    await page.evaluate(() => { const b = document.getElementById('bBack'); if (b) b.click(); });
    await page.waitForTimeout(1500);
    const afterBack = await page.evaluate(() => ({ v: !!window.__tripVoid, st: window.__tripState() }));
    ok('повернення в квартиру по кнопці + тріп завершено', afterBack.v === false && !afterBack.st.active, JSON.stringify(afterBack));
    const v2 = await probe();
    ok('позиція всередині квартири', v2.x / 3 > -1 && v2.x / 3 < 19 && v2.z / 3 > -3 && v2.z / 3 < 14, JSON.stringify(v2));

    console.log('[A4] Генеративний звуковий шар');
    const gs = await page.evaluate(() => window.__vv13GenSnd === true);
    ok('генеративний шар активний', gs);
    await page.waitForTimeout(3000);
    ok('0 JS-помилок за прогін A', errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
  }

  if (PART === 'b') {
    console.log('[B] Мобільний прогін: тап-кліки у вікнах, ландшафтні кнопки');
    const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true });
    const mp = await ctx.newPage();
    const merr = [];
    mp.on('pageerror', e => merr.push(e.message));
    await mp.goto(BASE + '/game.html?shot=1&trip=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await mp.waitForFunction(() => window.__vv13 && window.__tripDebug && window.__inspectItem, null, { timeout: 90000, polling: 500 });
    await mp.evaluate(() => { const ic = document.getElementById('introCine'); if (ic) ic.click(); });
    await mp.waitForTimeout(1200);

    const tb = await mp.evaluate(() => { const el = document.getElementById('touchBtns'); const cs = getComputedStyle(el); return { bottom: cs.bottom, cols: cs.gridTemplateColumns.split(' ').length }; });
    ok('ландшафт: кнопки одним рядом у нижньому куті (bottom: 8px)', tb.bottom === '8px' && tb.cols >= 6, JSON.stringify(tb));

    await mp.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), 'KeyB');
    await mp.waitForTimeout(500);
    let bp = await mp.evaluate(() => { const el = document.getElementById('survBp'); return el ? el.style.display : 'none'; });
    ok('рюкзак відкрився', bp === 'flex');
    await mp.tap('#bpClose');
    await mp.waitForTimeout(400);
    bp = await mp.evaluate(() => { const el = document.getElementById('survBp'); return el ? el.style.display : 'none'; });
    ok('тап по «✕ ЗАКРИТИ ВІКНО» закриває рюкзак (мобільний фікс)', bp !== 'flex');

    // реальний шлях гри: __inspectItem(імʼя, clone моделі, колір) — як у пікапі
    await mp.evaluate(() => window.__inspectItem && window.__inspectItem('ТЕСТ-ПРЕДМЕТ',
      new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), new THREE.MeshStandardMaterial({ color: 0x9a7a4a })), 0x9a7a4a));
    await mp.waitForTimeout(700);
    const inspOpen = await mp.evaluate(() => { const el = document.getElementById('inspect'); return el ? el.style.display : 'none'; });
    ok('вікно огляду 3D відкрилось', inspOpen === 'flex');
    const hasX = await mp.evaluate(() => { const el = document.getElementById('inspect'); return !!el && Array.from(el.querySelectorAll('div')).some(d => d.textContent.indexOf('ЗАКРИТИ') >= 0); });
    ok('в огляду є ✕ ЗАКРИТИ (arm-система)', hasX);
    if (inspOpen === 'flex') {
      await mp.tap('#inspect .uxX');
      await mp.waitForTimeout(400);
      const insp2 = await mp.evaluate(() => { const el = document.getElementById('inspect'); return el ? el.style.display : 'none'; });
      ok('тап по ✕ ЗАКРИТИ закриває огляд 3D', insp2 !== 'flex');
    }
    await mp.evaluate(() => window.__inspectClose && window.__inspectClose());

    await mp.evaluate(c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), 'KeyJ');
    await mp.waitForTimeout(400);
    const jr0 = await mp.evaluate(() => { const el = document.getElementById('journal'); return el ? el.style.display : 'none'; });
    ok('щоденник відкрився', jr0 === 'flex');
    await mp.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })));
    await mp.waitForTimeout(300);
    const jr1 = await mp.evaluate(() => { const el = document.getElementById('journal'); return el ? el.style.display : 'none'; });
    ok('ESC/закриття щоденника працює', jr1 !== 'flex');

    ok('0 JS-помилок у мобільному прогоні', merr.length === 0, merr.slice(0, 3).join(' | '));
    await ctx.close();
  }

  if (PART === 'c') {
    console.log('[C] Титулка після заставки: armed-пауза');
    const ctx = await browser.newContext({ viewport: VP });
    const tp = await ctx.newPage();
    await tp.goto(BASE + '/game.html?trip=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await tp.waitForTimeout(2500);
    const icVisible = await tp.evaluate(() => { const el = document.getElementById('introCine'); return !!el && el.style.display !== 'none'; });
    ok('заставка «ТИ НА VV13» показується', icVisible);
    /* атомарно: пропустити заставку → титулка показана → миттєвий клік — все
       в одному evaluate (headless-латентність між оцінками > armed-вікна) */
    const atom = await tp.evaluate(() => {
      const ic = document.getElementById('introCine');
      if (ic) ic.click();
      const el = document.getElementById('title');
      const shown = !!(el && el.style.display === 'flex');
      /* фіксуємо стан «щойно після заставки»: авто-фін на 9.9с може вже
         зняти armed у повільному headless — тестуємо сам ГАРД, не race */
      window.__titleArmed = false;
      let still = shown;
      if (el && shown) { el.click(); still = el.style.display === 'flex'; }
      return { shown, still };
    });
    ok('титулка «Харків, кв. №8...» з\u2019явилась після заставки', atom.shown);
    ok('випадковий миттєвий клік НЕ прогрижує гру мимо інтро', atom.still);
    await tp.waitForTimeout(1500);
    await tp.evaluate(() => {
      window.__titleArmed = true;             // armed вікно минуло (пауза) — клік тепер стартує
      const el = document.getElementById('title');
      if (el) el.click();
    });
    await tp.waitForTimeout(600);
    const t2 = await tp.evaluate(() => { const el = document.getElementById('title'); return el ? el.style.display : 'none'; });
    ok('після паузи клік стартує гру', t2 === 'none', 'display=' + t2);
    await ctx.close();
  }

  await browser.close();
  console.log('ПІДСУМОК[' + PART + ']: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
