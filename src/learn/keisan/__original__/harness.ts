/// <reference types="node" />
// テスト専用: 算数練習アプリ（元の JS）を Node の vm で動かす。画面の部品はダミーにする
// 元のファイル: ~/workspace/ts-spaces/suan-shu-ji-suan-lian-xi-apuri/index.html をそのまま写したもの（sansu-renshu.html）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ORIGINAL_HTML = fileURLToPath(new URL('./sansu-renshu.html', import.meta.url));

// 0以上1未満を返す決まった並びの乱数（元と移植の両方に同じものを渡す）
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FakeEl {
  id: string;
  classList: { add(...c: string[]): void; remove(...c: string[]): void; toggle(c: string, on?: boolean): void; contains(c: string): boolean };
  style: Record<string, string>;
  innerHTML: string; textContent: string; value: string;
  onclick: null | ((this: FakeEl) => void);
  listeners: Record<string, ((this: FakeEl, e: unknown) => void)[]>;
  [k: string]: unknown;
}

function fakeEl(id = ''): FakeEl {
  const cls = new Set<string>();
  const el: FakeEl = {
    id,
    classList: {
      add: (...c) => c.forEach(x => cls.add(x)),
      remove: (...c) => c.forEach(x => cls.delete(x)),
      toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); },
      contains: c => cls.has(c),
    },
    style: {}, innerHTML: '', textContent: '', value: '', onclick: null, listeners: {},
    appendChild: () => undefined,
    addEventListener(type: string, fn: (e: unknown) => void) { (el.listeners[type] ??= []).push(fn); },
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    animate: () => undefined,
    getAttribute: () => null, setAttribute: () => undefined,
    select: () => undefined, setSelectionRange: () => undefined,
  };
  return el;
}

export interface Original {
  ctx: vm.Context & Record<string, any>;
  el(id: string): FakeEl;
  setRandom(r: () => number): void;
  setNow(ms: number): void;
  flushTimers(): void;
  run(code: string): any;
}

// 元のスクリプト2つを順に読みこむ。REDUCED（動きを減らす）を true にして、トーストなどを待たずに進める
export function loadOriginal(): Original {
  const html = readFileSync(ORIGINAL_HTML, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (scripts.length !== 2) throw new Error(`expected 2 scripts, got ${scripts.length}`);

  const els = new Map<string, FakeEl>();
  const el = (id: string) => { let e = els.get(id); if (!e) { e = fakeEl(id); els.set(id, e); } return e; };
  const timers: (() => void)[] = [];
  let now = 0;
  const ctx = vm.createContext({
    document: {
      getElementById: el,
      createElement: () => fakeEl(),
      querySelectorAll: () => [],
      execCommand: () => undefined,
    },
    window: { matchMedia: () => ({ matches: true }), scrollTo: () => undefined },
    navigator: {},
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
    clearTimeout: () => undefined,
    console,
  }) as Original['ctx'];
  for (const s of scripts) vm.runInContext(s, ctx);
  vm.runInContext('Date.now = function(){ return __now(); };', Object.assign(ctx, { __now: () => now }));

  return {
    ctx,
    el,
    setRandom(r) { ctx.__rng = r; vm.runInContext('Math.random = __rng;', ctx); },
    setNow(ms) { now = ms; },
    flushTimers() { while (timers.length) timers.shift()!(); },
    run: code => vm.runInContext(code, ctx),
  };
}
