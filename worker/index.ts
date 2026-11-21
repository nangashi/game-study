import { createAccessVerifier } from './access';
import { handleApi, type Env } from './api';

// Worker の入口。/api/* だけここで処理し、それ以外は静的ファイル（dist）をそのまま返す。
// wrangler.jsonc の assets.run_worker_first で /api/* だけが Worker に来る（ほかは Worker を通らない）

const verify = createAccessVerifier(); // 公開鍵の控えをリクエストどうしで使い回す

const isApi = (pathname: string) => pathname === '/api' || pathname.startsWith('/api/');

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (isApi(new URL(req.url).pathname)) return handleApi(req, env, verify);
    return env.ASSETS.fetch(req);
  },
};
