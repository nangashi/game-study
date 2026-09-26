// prompt / choices は信頼できる自前の文字列だけを入れる HTML
// card: 間隔反復のカード（例: 'kanji:字'、'keisan:7+8'）。コインと出す順番はカードの定着度で決まる
// note: 答えたあとに出すひとこと（ことわざの意味など）
export type Question =
  | { kind: 'choice'; card: string; prompt: string; choices: string[]; answer: number; note?: string }
  | { kind: 'number'; card: string; prompt: string; answer: number }
  | {
      kind: 'write'; card: string; char: string;
      // trace: うすい字をなぞる / model: 横のお手本を見て書く / none: 何も見ずに書く
      guide: 'trace' | 'model' | 'none';
      prompt: string;
    }
  // ひらがなを入力する（画面の五十音キー）。answers のどれかと同じなら正解
  | { kind: 'kana'; card: string; prompt: string; answers: string[] }
  // タップして正しい順にならべる。items が正しい順
  | { kind: 'order'; card: string; prompt: string; items: string[] };

// helped: おてほんを見た・何度も間違えてヒントが出た（正解でも復習に回す）
// ms: 問題が出てから答えるまでの時間
export interface Answer { correct: boolean; helped?: boolean; ms?: number }
