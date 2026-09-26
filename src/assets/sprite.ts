// スプライトシートの共通の扱い。シートの中身（フレーム名）は scripts/art/build.mjs が *.gen.ts に書き出す
// くわしくは docs/02-asset-generation.md

export interface Sheet {
  url: string;     // BASE_URL からの相対パス
  cell: number;    // 1コマの大きさ(px)
  cols: number;
  rows: number;
  frames: Readonly<Record<string, number>>;
}

export const assetUrl = (url: string) => `${import.meta.env.BASE_URL}${url}`;

const len = (size: number | string) => (typeof size === 'number' ? `${size}px` : size);

// CSS スプライト（DOM 用）の style。size は px または CSS の長さ
export function spriteStyle(sheet: Sheet, frame: number, size: number | string): string {
  const c = frame % sheet.cols, r = Math.floor(frame / sheet.cols);
  const x = sheet.cols > 1 ? (c / (sheet.cols - 1)) * 100 : 0, y = sheet.rows > 1 ? (r / (sheet.rows - 1)) * 100 : 0;
  return `width:${len(size)};height:${len(size)};background-image:url(${assetUrl(sheet.url)});background-size:${sheet.cols * 100}% ${sheet.rows * 100}%;background-position:${x}% ${y}%`;
}

export function spriteHtml<S extends Sheet>(sheet: S, name: keyof S['frames'] & string, size: number | string = '1.2em', cls = ''): string {
  const frame = sheet.frames[name];
  if (frame == null) throw new Error(`unknown sprite ${name}`);
  return `<span class="${cls ? `ico ${cls}` : 'ico'}" role="img" aria-label="${name}" style="${spriteStyle(sheet, frame, size)}"></span>`;
}

export function spriteEl<S extends Sheet>(sheet: S, name: keyof S['frames'] & string, size?: number | string, cls = ''): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = spriteHtml(sheet, name, size, cls);
  return t.content.firstElementChild as HTMLElement;
}
