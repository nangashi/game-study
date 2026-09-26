// サバイバーを ヘッドレスブラウザで うごかして、スクリーンショットと 状態のログを とる（docs/games/survivor.md）
// ステージ n を 推奨強化レベルで クリアできるかを たしかめる。
//
// じゅんび: scripts/playtest.mjs と同じ（playwright）
// つかいかた:
//   node scripts/playtest-survivor.mjs [--stage=1] [--up=<数値の強化レベルの合計。省略すると推奨レベル>] [--weapons=all|orbit,frost] [--start=rang] [--reroll=0-3] [--slot=1] [--bot=smart|still] [--grade=1|k] [--out=playtest-out] [--shots=10]
//   --weapons / --start / --reroll / --slot は 解放（docs/03 4.）。つけたぶんは --up から へらさない
//   bot: smart（敵から にげながら ジェムと アイテムを ひろう）/ still（うごかない。へたな子のかわり）
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const opt = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const stage = Number(opt.stage ?? 1);
// 推奨強化レベル（src/state/economy.ts の recommendedLevel と同じ: 1ステージ 80コインを 40+20×Lv の強化に 安いものから）
function recommended(stage) {
  let coins = Math.max(0, 80 * (stage - 3)), lv = [0, 0, 0, 0], n = 0;
  for (;;) {
    const i = lv.indexOf(Math.min(...lv));
    const cost = 40 + 20 * lv[i];
    if (lv[i] >= 10 || cost > coins) return n;
    coins -= cost; lv[i]++; n++;
  }
}
const up = Number(opt.up ?? recommended(stage));
const bot = opt.bot ?? 'smart';
const out = opt.out ?? 'playtest-out';
const every = Number(opt.shots ?? 10);
const port = Number(opt.port ?? 5199);
mkdirSync(out, { recursive: true });

// 強化は 4つに なるべく同じだけ ふりわける
const ids = ['atk', 'hp', 'speed', 'magnet'];
const upgrades = Object.fromEntries(ids.map((id, i) => [id, Math.floor(up / 4) + (i < up % 4 ? 1 : 0)]));
const extra = opt.weapons === 'all' ? ['orbit', 'frost', 'thunder', 'sword'] : (opt.weapons ?? '').split(',').filter(Boolean);
for (const w of extra) upgrades[`w_${w}`] = 1;
if (opt.reroll) upgrades.reroll = Number(opt.reroll);
if (opt.slot) upgrades.slot = Number(opt.slot);

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
  const profile = {
    id: 'p1', name: 'テスト', avatar: 'cat', grade: opt.grade === 'k' ? 'k' : Number(opt.grade ?? 1), tolerance: 'easy',
    coins: 0, tickets: 3, tracks: {}, cards: {},
    games: { survivor: { stage: stage - 1, best: 0, plays: 0, clears: 0, upgrades, data: opt.start ? { start: opt.start } : undefined } },
    daily: { date: '2000-01-01', quests: 0, ticketsEarned: 0, subjects: [] }, streak: { count: 0, last: '' },
    stats: { quests: 0, correct: 0 },
  };
  await page.addInitScript(p => localStorage.setItem('manabi-survivor:v1', JSON.stringify({ version: 1, profiles: [p], settings: { ticketsPerDay: 3, questLength: 5 } })), profile);
  await page.goto(`http://localhost:${port}/`);
  await page.getByText('テスト').first().click();
  await page.locator('.big-btn.battle').click();
  await page.locator('.game-card').filter({ hasText: 'サバイバー' }).click();
  await page.locator('.lobby-play').click();
  await page.waitForFunction(() => window.__survivor?.t > 0.3);

  // bot: 100ms ごとに スティックを うごかす。レベルアップは ぶきを優先して えらぶ
  await page.evaluate(bot => {
    const s = window.__survivor;
    let orbitDir = 1;
    setInterval(() => {
      // おみせ: かえるものを 左から かう（スキル → たからばこ → おにく）。かえなくなったら とじる
      const shop = document.querySelector('.sv-shop');
      if (shop) {
        const can = [...shop.querySelectorAll('.skill:not(:disabled)')];
        // MAX の ぶきが あれば たからばこ（しんか）を さきに
        const ready = ['bolt', 'rang', 'boom', 'orbit', 'frost', 'thunder', 'sword'].some(w => s.skill[w] >= 5 && !s.evolved.includes(w));
        const chest = can.find(b => b.textContent.includes('たからばこ'));
        if (ready && chest) chest.click();
        else if (can.length) can[0].click(); else shop.querySelector('.sv-shop-close')?.click();
        return;
      }
      const pick = document.querySelectorAll('.skill');
      if (pick.length) {
        const order = ['rang', 'sword', 'thunder', 'frost', 'boom', 'orbit', 'bolt', 'heart', 'shoes', 'magnet'];
        const names = { bolt: 'まほうだま', orbit: 'まわるほし', boom: 'どかーん', rang: 'ブーメラン', thunder: 'かみなり', frost: 'こおり', sword: 'つるぎ', shoes: 'はやあし', heart: 'げんき', magnet: 'すいよせ' };
        const btns = [...pick];
        // 持っている ぶきを先に MAX にする（しんかさせたいので）
        // もっている ぶきを先に MAX にする（ぶきの わくは ゲームが きめる）
        const owned = order.filter(id => s.skill[id] > 0 && s.skill[id] < 5);
        const rest = order;
        const want = [...owned, ...rest].map(id => btns.find(b => b.textContent.includes(names[id]))).find(Boolean);
        (want ?? btns[0]).click();
        return;
      }
      if (bot !== 'smart' || s.ended || s.paused) return;
      const px = s.player.x, py = s.player.y;
      let fx = 0, fy = 0;
      for (const e of s.enemies) {
        const dx = px - e.obj.x, dy = py - e.obj.y, d = Math.hypot(dx, dy) || 1;
        if (d < 320) { const w = (e.boss ? 4 : e.role === 'tank' ? 2 : 1) / (d * d) * 1e4; fx += dx / d * w; fy += dy / d * w; }
      }
      for (const sh of s.shots) {
        const dx = px - sh.obj.x, dy = py - sh.obj.y, d = Math.hypot(dx, dy) || 1;
        if (d < 200) { fx += dx / d * 3e4 / (d * d); fy += dy / d * 3e4 / (d * d); }
      }
      // アイテムと ジェムに よっていく
      // ジェムは ちかくの 5こだけ ねらう（ぜんぶ たすと 敵の むれに つっこんでしまう）
      const near = s.gems.map(g => ({ x: g.obj.x, y: g.obj.y, w: 0.6, d: Math.hypot(g.obj.x - px, g.obj.y - py) })).sort((a, b) => a.d - b.d).slice(0, 5);
      const goals = [...s.pickups.map(p => ({ x: p.obj.x, y: p.obj.y, w: 3 })), ...near];
      for (const g of goals) {
        const dx = g.x - px, dy = g.y - py, d = Math.hypot(dx, dy) || 1;
        if (d < 700) { fx += dx / d * g.w * 200 / (d + 100); fy += dy / d * g.w * 200 / (d + 100); }
      }
      // まわりが こんでいたら、よこに まわりこむ
      const len = Math.hypot(fx, fy);
      if (Math.random() < 0.01) orbitDir *= -1;
      let dx = fx / (len || 1), dy = fy / (len || 1);
      if (len < 0.3) { dx = Math.cos(s.t) * orbitDir; dy = Math.sin(s.t); }
      s.stick = { active: true, id: 99, bx: 200, by: 500, dx, dy };
    }, 100);
  }, bot);

  const log = [];
  let shot = 0;
  const start = Date.now();
  while ((Date.now() - start) / 1000 < 900) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => {
      const s = window.__survivor;
      return {
        t: Math.round(s.t), medals: s.medals, hp: `${s.hp}/${s.maxHp}`, lv: s.level, kills: s.kills, enemies: s.enemies.length,
        skill: Object.entries(s.skill).filter(([, v]) => v).map(([k, v]) => k + v).join(','),
        evo: s.evolved.join(','), boss: s.boss ? Math.round(s.boss.hp) + '/' + Math.round(s.boss.maxHp) : '-', ended: s.ended,
      };
    });
    if (st.t >= shot * every || st.ended) {
      log.push(JSON.stringify(st));
      await page.screenshot({ path: `${out}/survivor-s${stage}-${String(shot).padStart(2, '0')}.png` });
      shot++;
    }
    if (st.ended) break;
  }
  const res = await page.locator('.overlay').last().innerText().catch(() => '');
  console.log(`stage ${stage} up ${up} (${JSON.stringify(upgrades)}) bot ${bot}`);
  console.log(log.join('\n'));
  console.log('result:', res.replace(/\s+/g, ' '));
  console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors');
} finally {
  await browser.close();
  await server.close();
}
