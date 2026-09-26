import type { SHEETS } from './assets.gen';

type IconName = keyof typeof SHEETS.icons.frames;

export type SkillId = 'bolt' | 'orbit' | 'boom' | 'shoes' | 'heart' | 'magnet';

export const SKILLS: Record<SkillId, { icon: IconName; name: string; desc: string; max: number }> = {
  bolt:   { icon: 'bolt', name: 'まほうだま', desc: 'たまが ふえる',       max: 6 },
  orbit:  { icon: 'orbit', name: 'まわるほし', desc: 'ほしが まわりを まもる', max: 6 },
  boom:   { icon: 'boom', name: 'どかーん',   desc: 'まわりを ふきとばす',  max: 6 },
  shoes:  { icon: 'shoe', name: 'はやあし',   desc: 'はやく うごける',     max: 5 },
  heart:  { icon: 'heart', name: 'げんき',     desc: 'ハートが ふえる',     max: 5 },
  magnet: { icon: 'magnet', name: 'すいよせ',   desc: 'ジェムを あつめやすい', max: 5 },
};

// power: クイズに正解すると 2（レベルが2つ上がる）
export interface SkillPick { id: SkillId; power: 1 | 2 }

export function skillChoices(levels: Record<SkillId, number>, rng = Math.random): SkillId[] {
  const open = (Object.keys(SKILLS) as SkillId[]).filter(id => levels[id] < SKILLS[id].max);
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  return open.slice(0, 3);
}
