import type { TrackId } from '../state/types';

// prompt / choices は信頼できる自前の文字列だけを入れる HTML
export type Question =
  | { kind: 'choice'; track: TrackId; prompt: string; choices: string[]; answer: number; card?: string }
  | { kind: 'number'; track: TrackId; prompt: string; answer: number; card?: string }
  | {
      kind: 'write'; track: TrackId; card: string; char: string;
      // trace: うすい字をなぞる / model: 横のお手本を見て書く / none: 何も見ずに書く
      guide: 'trace' | 'model' | 'none';
      prompt: string;
    };

// helped: おてほんを見た・何度も間違えてヒントが出た（正解でも復習に回す）
export interface Answer { correct: boolean; helped?: boolean }
