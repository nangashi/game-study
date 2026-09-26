// あそびラボのゲームを ヘッドレスブラウザで うごかして、スクリーンショットと 状態のログを とる。
// バランス調整の たしかめに つかう（docs/03-game-candidates.md）。
//
// じゅんび（playwright は package.json に入れていない）:
//   npm i --no-save playwright && npx playwright install chromium-headless-shell
// つかいかた:
//   node scripts/playtest.mjs <game> [strategy] [--seconds=60] [--grade=1|k] [--out=playtest-out]
//   game: defense | sling | grow
//   strategy:
//     defense: auto（しょうかん+がったい）/ nomerge（しょうかんだけ）/ idle
//     sling:   auto（まわりの敵に むけて ひっぱり つづける）/ idle
//     grow:    auto（ぐるぐる あるく）/ idle
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const [game = 'defense', strategy = 'auto', ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map(a => a.replace(/^--/, '').split('=')));
const seconds = Number(opt.seconds ?? 60);
const out = opt.out ?? 'playtest-out';
mkdirSync(out, { recursive: true });

const NAMES = { defense: 'モンスターまもり', sling: 'ひっぱりアタック', grow: 'ぱくぱくビッグ' };
// ゲームごとに ログに出す 値（window.__lab は LabScene）
const SNAP = {
  defense: s => ({ fence: s.fence, kills: s.kills, coins: s.coins, zombies: s.zombies.length, units: s.units.filter(Boolean).map(u => u.kind[0] + u.lv).join(',') }),
  sling: s => ({ hp: s.hp, kills: s.kills, wave: s.wave, bestCombo: s.bestCombo, foes: s.foes.length }),
  grow: s => ({ size: Math.round(s.size), eaten: s.eaten, bestChain: s.bestChain, things: s.things.length }),
};

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
  const profile = {
    id: 'p1', name: 'テスト', avatar: 'cat', grade: opt.grade === 'k' ? 'k' : Number(opt.grade ?? 1), tolerance: 'easy',
    coins: 0, feathers: 0, stars: 0, tickets: 3, upgrades: { hp: 0, atk: 0, speed: 0, magnet: 0 }, tracks: {}, cards: {},
    daily: { date: '2000-01-01', quests: 0, ticketsEarned: 0 }, streak: { count: 0, last: '' },
    stats: { quests: 0, correct: 0, runs: 0, clears: 0, bestKills: 0 },
  };
  await page.addInitScript(p => localStorage.setItem('manabi-survivor:v1', JSON.stringify({ version: 1, profiles: [p], settings: { ticketsPerDay: 3, questLength: 5, runSeconds: 180 } })), profile);
  await page.goto('http://localhost:5199/');
  await page.getByText('テスト').first().click();
  await page.getByText('あそびラボ').first().click();
  await page.getByText(NAMES[game]).click();
  await page.waitForFunction(() => window.__lab?.t > 0.3);

  if (strategy !== 'idle') {
    await page.evaluate(([game, strategy]) => {
      const s = window.__lab;
      setInterval(() => {
        if (s.ended) return;
        if (game === 'defense') {
          if (s.coins >= s.cost && s.units.some(u => !u)) s.summon();
          if (strategy === 'nomerge') return;
          const us = s.units.filter(Boolean);
          for (const a of us) for (const b of us) {
            if (a !== b && a.kind === b.kind && a.lv === b.lv && a.lv < 5 && !s.tweens.isTweening(a.spr) && !s.tweens.isTweening(b.spr)) return s.merge(a, b);
          }
        }
      }, 700);
    }, [game, strategy]);
  }

  const m = page.mouse;
  const log = [];
  const start = Date.now();
  let shot = 0;
  while ((Date.now() - start) / 1000 < seconds) {
    if (strategy !== 'idle' && game === 'sling') {
      // いちばん近い敵の はんたいがわに ひっぱる
      const aim = await page.evaluate(() => {
        const s = window.__lab, h = s.hero, f = s.foes[0];
        return f ? { x: h.x - f.obj.x, y: h.y - f.obj.y } : { x: Math.random() - 0.5, y: Math.random() - 0.5 };
      });
      const len = Math.hypot(aim.x, aim.y) || 1;
      await m.move(500, 400); await m.down();
      await m.move(500 + aim.x / len * 160, 400 + aim.y / len * 160, { steps: 4 });
      await m.up();
      await page.waitForTimeout(1200);
    } else if (strategy !== 'idle' && game === 'grow') {
      const a = (Date.now() / 1500) % (Math.PI * 2);
      await m.move(500, 400); await m.down();
      await m.move(500 + Math.cos(a) * 60, 400 + Math.sin(a) * 60, { steps: 2 });
      await page.waitForTimeout(1000);
      await m.up();
    } else {
      await page.waitForTimeout(1000);
    }
    if ((Date.now() - start) / 1000 > shot * 10) {
      const st = await page.evaluate(g => { const s = window.__lab; return { t: Math.round(s.t), ended: s.ended }; }, game);
      const snap = await page.evaluate(`(${SNAP[game].toString()})(window.__lab)`);
      log.push(JSON.stringify({ ...st, ...snap }));
      await page.screenshot({ path: `${out}/${game}-${String(shot).padStart(2, '0')}.png` });
      shot++;
      if (st.ended) break;
    }
  }
  console.log(log.join('\n'));
  console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors');
} finally {
  await browser.close();
  await server.close();
}
