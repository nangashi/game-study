import { describe, expect, it } from 'vitest';
import { BOSS_AT, ENEMY_POWER_PER_LEVEL, MAIN_SECONDS, SURVIVOR_STAGES, TRAIT_DESC, WORLDS, enemyPower, isBossStage, stageSpec, starsOf } from './stages';
import { BASE_SLOTS, BASE_WEAPONS, LEVEL_NOTES, SKILLS, WEAPONS, levelNote, chestReward, emptyLevels, openSkills, shopOffers, skillChoices, type Loadout, type SkillId } from './skills';
import { SURVIVOR_UPGRADES } from './upgrades';
import { recommendedLevel } from '../../state/economy';

const levels = (o: Partial<Record<SkillId, number>> = {}): Record<SkillId, number> => ({ ...emptyLevels(), bolt: 1, ...o });
const all: Loadout = { pool: WEAPONS, slots: BASE_SLOTS };

describe('サバイバーのステージ', () => {
  it('3つのせかい × 5ステージ。5ステージめはボス', () => {
    expect(SURVIVOR_STAGES).toBe(15);
    expect([5, 10, 15].every(isBossStage)).toBe(true);
    expect(stageSpec(5).bigBoss).toBe(true);
    expect(stageSpec(6).world).toBe(1);
  });

  it('ステージ1から たまを うつ敵が出る。ステージ1〜3は強さが同じで、数と種類で むずかしくなる', () => {
    expect(stageSpec(1).roles).toContain('shooter');
    expect(stageSpec(1).power).toBe(1);
    expect(stageSpec(3).power).toBe(1);
    expect(stageSpec(1).roles.length).toBeLessThan(stageSpec(3).roles.length);
    expect(stageSpec(1).density).toBeLessThan(stageSpec(3).density);
    expect(stageSpec(1).shooterCap).toBe(2);
    expect(stageSpec(2).shooterCap).toBe(3);
    expect(stageSpec(15).shooterCap).toBeLessThanOrEqual(8);
  });

  it('敵の強さは推奨強化レベルにそろえて足し算で上がる', () => {
    const r = (n: number) => recommendedLevel(n, SURVIVOR_UPGRADES);
    for (let n = 4; n <= SURVIVOR_STAGES; n++) {
      expect(enemyPower(n) - enemyPower(n - 1)).toBeCloseTo(ENEMY_POWER_PER_LEVEL * (r(n) - r(n - 1)));
    }
  });

  it('敵は 15たい ぜんぶ とくちょうが ちがう', () => {
    const traits = WORLDS.flatMap(w => (['swarm', 'fast', 'dasher', 'shooter', 'tank'] as const).map(r => w.traits[r]));
    expect(new Set(traits).size).toBe(15);
    for (const t of traits) expect(TRAIT_DESC[t]).toBeTruthy();
  });

  it('イベントは時間の順にならび、ボスの前に つよい敵2回・おみせ2回。4分より前に おわる', () => {
    for (let n = 1; n <= SURVIVOR_STAGES; n++) {
      const ev = stageSpec(n).events;
      expect(ev.map(e => e.at)).toEqual([...ev.map(e => e.at)].sort((a, b) => a - b));
      const before = ev.filter(e => e.at < BOSS_AT);
      expect(before.filter(e => e.kind === 'elite').length).toBe(2);
      expect(before.filter(e => e.kind === 'shop').length).toBe(2);
      expect(ev.find(e => e.kind === 'boss')?.at).toBe(BOSS_AT);
      expect(ev.every(e => e.at < MAIN_SECONDS)).toBe(true);
    }
  });

  it('1回は3〜7分（docs/03 2.）', () => {
    expect(MAIN_SECONDS).toBeGreaterThanOrEqual(180);
    expect(MAIN_SECONDS).toBeLessThanOrEqual(420);
  });

  it('★は クリア・ボス・ハート半分 の3つ', () => {
    expect(starsOf({ cleared: false, bossDefeated: true, hp: 5, maxHp: 5 })).toBe(0);
    expect(starsOf({ cleared: true, bossDefeated: false, hp: 1, maxHp: 5 })).toBe(1);
    expect(starsOf({ cleared: true, bossDefeated: true, hp: 3, maxHp: 5 })).toBe(3);
  });
});

describe('サバイバーのスキル', () => {
  it('ぶきは ぜんぶ しんかと とくちょう（tag）がある', () => {
    for (const w of WEAPONS) {
      expect(SKILLS[w].evo, w).toBeTruthy();
      expect(SKILLS[w].tag, w).toBeTruthy();
    }
  });

  it('でてくる ぶきは 解放したものだけ', () => {
    const lo: Loadout = { pool: BASE_WEAPONS, slots: 3 };
    for (let i = 0; i < 20; i++) {
      for (const id of skillChoices(levels(), lo)) expect(['bolt', 'rang', 'boom', 'shoes', 'heart', 'magnet']).toContain(id);
    }
  });

  it('ぶきの わくが いっぱいなら、あたらしい ぶきは でない', () => {
    const full = levels({ bolt: 2, rang: 1, boom: 1 });
    expect(openSkills(full, all).filter(id => full[id] === 0 && WEAPONS.includes(id as never))).toEqual([]);
    expect(openSkills(full, { pool: WEAPONS, slots: 4 })).toContain('frost');
  });

  it('MAX のスキルは出さない', () => {
    const ids = skillChoices(levels({ bolt: 5, rang: 5 }), all);
    expect(ids).not.toContain('bolt');
    expect(ids).not.toContain('rang');
    expect(ids.length).toBe(3);
  });

  it('たからばこ: MAX のぶきがあれば しんか、なければ 持っているものを上げる', () => {
    expect(chestReward(levels({ bolt: 5 }), [], all)).toEqual({ evolve: 'bolt' });
    const r = chestReward(levels({ bolt: 3, rang: 2 }), [], all);
    expect('levelUp' in r && r.levelUp.every(id => ['bolt', 'rang'].includes(id))).toBe(true);
  });
});

describe('サバイバーの おみせ', () => {
  it('スキル3つ + おにく + たからばこ。ねだんは 30 まで', () => {
    const offers = shopOffers(levels({ bolt: 3 }), all);
    expect(offers.filter(o => o.kind === 'skill').length).toBe(3);
    expect(offers.map(o => o.kind)).toContain('heal');
    expect(offers.map(o => o.kind)).toContain('chest');
    expect(Math.max(...offers.map(o => o.price))).toBeLessThanOrEqual(30);
  });
});

describe('レベルアップで かわること', () => {
  it('ぶきは どの レベルでも かならず なにかが かわる（カードに「つぎ」を出す）', () => {
    for (const w of WEAPONS) {
      expect(LEVEL_NOTES[w].length).toBe(SKILLS[w].max - 1);
      for (let lv = 2; lv <= SKILLS[w].max; lv++) expect(levelNote(w, lv)).toBeTruthy();
      expect(levelNote(w, 1)).toBeNull();
    }
    expect(levelNote('heart', 2)).toBeNull();
  });
});
