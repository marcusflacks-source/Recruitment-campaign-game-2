/**
 * Serverless endpoint: POST /api/validate-run
 *
 * The per-game anti-cheat hook. The SHARED leaderboard service calls this before
 * recording a cast-for-the-catch score; it returns the server-authoritative
 * score and a tamper flag. This endpoint is game-specific and additive — it does
 * not modify the shared leaderboard or capture services.
 *
 * Written against the Web Fetch API (Request → Response) so it deploys as a
 * Vercel Edge Function, a Cloudflare Worker, or a Supabase Edge Function
 * unchanged. Rate limiting here is a per-instance backstop; the authoritative
 * limiter is the shared service's managed store (Supabase/Redis).
 */
import type { RunTelemetry } from '../src/hub/types';
import { validateRun } from './_lib/validateRun';

const WINDOW_MS = 60_000;
const MAX_SUBMITS_PER_WINDOW = 8;
const buckets = new Map<string, number[]>();

function rateLimited(key: string, now: number): boolean {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  buckets.set(key, hits);
  return hits.length > MAX_SUBMITS_PER_WINDOW;
}

interface ValidateRequestBody {
  anonId: string;
  telemetry: RunTelemetry;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: ValidateRequestBody;
  try {
    body = (await req.json()) as ValidateRequestBody;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!body?.anonId || !body?.telemetry) {
    return json({ error: 'missing_fields' }, 400);
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const key = `${body.anonId}:${ip}`;
  // Timestamp is provided by the caller-side store in production; Date.now keeps
  // this endpoint self-contained for the per-instance backstop.
  const now = Date.now();
  if (rateLimited(key, now)) {
    return json({ accepted: false, reason: 'rate_limited' }, 429);
  }

  const result = validateRun(body.telemetry);
  return json({
    accepted: result.valid,
    recordedScore: result.recordedScore,
    tampered: result.tampered,
    reason: result.valid ? undefined : result.reasons[0],
    reasons: result.reasons,
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Vercel Edge runtime hint (ignored elsewhere).
export const config = { runtime: 'edge' };
