import type { SHEETS } from './assets.gen';

type IconName = keyof typeof SHEETS.icons.frames;

// 1回だけの成長（ラン内）。敵の波をたおすたびに3つから1つえらぶ（docs 4.）
export type HSkillId = 'power' | 'pierce' | 'split' | 'boom' | 'wall' | 'heal';

export const HSKILLS: Record<HSkillId, { icon: IconName; name: string; desc: string; max: number }> = {
  power:  { icon: 'arm',    name: 'ちから',     desc: 'あたると いたい',            max: 5 },
  pierce: { icon: 'arrow',  name: 'つらぬき',   desc: 'てきを つきぬける',          max: 1 },
  split:  { icon: 'balls',  name: 'ぶんしん',   desc: 'ちいさい たまも とぶ',        max: 3 },
  boom:   { icon: 'bomb',   name: 'どかーん',   desc: 'あてると まわりも ばくはつ',   max: 3 },
  wall:   { icon: 'spring', name: 'かべパワー', desc: 'かべで はねると つよくなる',   max: 3 },
  heal:   { icon: 'heart',  name: 'げんき',     desc: 'ハートが ふえて ぜんかい',     max: 5 },
};

export const noSkills = (): Record<HSkillId, number> => ({ power: 0, pierce: 0, split: 0, boom: 0, wall: 0, heal: 0 });

export function hSkillChoices(levels: Record<HSkillId, number>, rng = Math.random): HSkillId[] {
  const open = (Object.keys(HSKILLS) as HSkillId[]).filter(id => levels[id] < HSKILLS[id].max);
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  return open.slice(0, 3);
}
