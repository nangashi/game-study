import { RECORDS_VERSION, emptyFamily, mergeFamily, normalizeFamily, stableKey, type FamilyRecords } from '../src/records';
import type { AccessVerifier } from './access';

// /api/* の処理。家族で1つのデータ（manabi:v2 の形）を KV に置く。
//   GET /api/family … いまのデータ（なければ空）
//   PUT /api/family … 送られてきたデータを KV のデータと mergeFamily で合わせて保存し、合わせた結果を返す
// サーバーでも合わせるので、端末どうしが古い控えを送り合っても記録は消えない（全体の上書きはしない）

// KV のうち使うところだけ（テストでは偽物に差し替える）
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  FAMILY: KVLike;
  ASSETS: { fetch(req: Request): Promise<Response> };
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export const FAMILY_KEY = 'family:v2';
export const MAX_BODY_BYTES = 512 * 1024; // 子ども数人ぶんなら数十 KB。大きすぎるものは断る

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });

async function readFamily(kv: KVLike): Promise<{ data: FamilyRecords; raw: string | null }> {
  const raw = await kv.get(FAMILY_KEY);
  if (raw == null) return { data: emptyFamily(), raw };
  try {
    return { data: normalizeFamily(JSON.parse(raw)), raw };
  } catch {
    return { data: emptyFamily(), raw }; // こわれていたら空として合わせ直す
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function handleApi(req: Request, env: Env, verify: AccessVerifier): Promise<Response> {
  const auth = await verify(req, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD });
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const { pathname } = new URL(req.url);
  if (pathname !== '/api/family') return json(404, { error: 'not found' });

  if (req.method === 'GET') {
    const { data } = await readFamily(env.FAMILY);
    return json(200, data);
  }

  if (req.method === 'PUT') {
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return json(415, { error: 'content-type must be application/json' });
    }
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return json(413, { error: 'too large' });
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: 'too large' });

    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return json(400, { error: 'invalid json' }); }
    // 版がちがうものを空として合わせると何も起きないだけだが、送り手のまちがいなので断って知らせる
    if (!isObj(raw) || raw.version !== RECORDS_VERSION || !isObj(raw.children)) {
      return json(400, { error: 'unsupported records format' });
    }

    const incoming = normalizeFamily(raw);
    const stored = await readFamily(env.FAMILY);
    const merged = mergeFamily(stored.data, incoming);
    // 変わらないときは書かない（KV の書き込み回数の節約）
    if (stored.raw == null || stableKey(merged) !== stableKey(stored.data)) {
      await env.FAMILY.put(FAMILY_KEY, JSON.stringify(merged));
    }
    return json(200, merged);
  }

  return json(405, { error: 'method not allowed' }, { allow: 'GET, PUT' });
}
