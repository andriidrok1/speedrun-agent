// Live-post verification before Stripe payout.
// Runs inside a Cloudflare Worker: only `fetch`, AbortController and TextDecoder. No Node APIs.
//
// Step 1 (always): plain HTTP GET with a desktop Chrome UA. Good enough for brand sites and any
// server-rendered page. Instagram/TikTok usually answer a logged-out datacenter fetch with a login
// wall (see reference/browserbase.md section 6), which we detect and report as verified=false.
// Step 2 (optional): if Browserbase creds are passed we create a session via the REST API so the
// caller knows a real-browser check is reachable. Driving the browser is NOT implemented (no SDK).

export type VerifyMethod = 'fetch' | 'browserbase' | 'mock';

export type VerifyResult = {
  verified: boolean;
  method: VerifyMethod;
  status?: number;
  reason: string;
  checkedAt: string;
  /** Final URL after redirects, when known. */
  finalUrl?: string;
  /** Set when Browserbase creds were given: whether a session could be created, and its id. */
  browserbase?: { sessionId?: string; note: string };
};

export type VerifyInput = {
  url: string;
  /** Handle or tag that must appear in the page (case-insensitive), e.g. "@marinelayer" or "Marine Layer". */
  requiredTag?: string;
  browserbase?: { apiKey: string; projectId?: string };
  timeoutMs?: number;
};

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MIN_BODY_BYTES = 2048;

export async function verifyPostLive(input: VerifyInput): Promise<VerifyResult> {
  const checkedAt = new Date().toISOString();
  const base = await fetchCheck(input, checkedAt);
  if (!input.browserbase?.apiKey) return base;
  return { ...base, browserbase: await browserbaseProbe(input.browserbase, input.timeoutMs ?? 10_000) };
}

/** Demo mode: no network. */
export function mockVerify(_url: string): VerifyResult {
  return { verified: true, method: 'mock', reason: 'mock', checkedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- step 1: plain fetch

async function fetchCheck(input: VerifyInput, checkedAt: string): Promise<VerifyResult> {
  const timeoutMs = input.timeoutMs ?? 10_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const fail = (reason: string, status?: number, finalUrl?: string): VerifyResult => ({
    verified: false, method: 'fetch', status, reason, checkedAt, finalUrl,
  });

  let res: Response;
  try {
    res = await fetch(input.url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': CHROME_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === 'AbortError';
    return fail(aborted ? `timeout after ${timeoutMs}ms` : `fetch failed: ${errMsg(err)}`);
  }

  const finalUrl = res.url || input.url;
  let body: string;
  try {
    body = await res.text();
  } catch (err) {
    clearTimeout(timer);
    return fail(`could not read body: ${errMsg(err)}`, res.status, finalUrl);
  }
  clearTimeout(timer);

  if (res.status < 200 || res.status >= 300) return fail(String(res.status), res.status, finalUrl);

  const wall = loginWallReason(finalUrl, body);
  if (wall) return fail(wall, res.status, finalUrl);

  if (body.length < MIN_BODY_BYTES) {
    return fail(`page too small (${body.length} bytes, need ${MIN_BODY_BYTES})`, res.status, finalUrl);
  }

  // Instagram/TikTok answer a logged-out fetch with one generic JS shell (HTTP 200, title
  // "Instagram" / "TikTok - Make Your Day", zero og:* meta) for real AND nonexistent URLs, so a
  // body-text match proves nothing. Verified 2026-09-28 from a residential IP; a Worker's egress
  // IP will do no better. Only trust og meta there, and refuse to verify a shell.
  const social = isSocialHost(finalUrl);
  const ogTitle = metaContent(body, 'og:title');
  const ogDesc = metaContent(body, 'og:description');
  if (social && !ogTitle && !ogDesc) {
    const errPage = /"pageID":"httpErrorPage"/.test(body) ? ', body marks it httpErrorPage' : '';
    return fail(`${social} served a client-rendered shell with no og meta (same page for real and missing URLs${errPage}); needs a real browser (Browserbase)`, res.status, finalUrl);
  }

  if (input.requiredTag) {
    const where = findTag(body, input.requiredTag, { ogOnly: !!social });
    if (!where) {
      return fail(`tag ${input.requiredTag} not found in ${social ? 'og:title/og:description' : 'page body or og:title/og:description'}`, res.status, finalUrl);
    }
    return { verified: true, method: 'fetch', status: res.status, reason: `ok (tag ${input.requiredTag} found in ${where})`, checkedAt, finalUrl };
  }

  return { verified: true, method: 'fetch', status: res.status, reason: 'ok', checkedAt, finalUrl };
}

/** Instagram/TikTok (and similar) login-wall heuristics. Returns a reason or null. */
function loginWallReason(finalUrl: string, body: string): string | null {
  let path = '';
  try { path = new URL(finalUrl).pathname.toLowerCase(); } catch { path = finalUrl.toLowerCase(); }
  if (path.includes('/accounts/login') || path === '/login' || path.startsWith('/login/') || path.endsWith('/login')) {
    return `login wall (redirected to ${finalUrl})`;
  }
  const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  if (/^log in\b/i.test(title) || /^login\b/i.test(title)) return `login wall (page title "${title}")`;
  return null;
}

/** instagram.com / tiktok.com (any subdomain). Returns the platform name or null. */
function isSocialHost(url: string): 'instagram' | 'tiktok' | null {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  return null;
}

/** Looks for the tag in og:title, og:description, then (unless ogOnly) the whole body. Returns where it was found. */
function findTag(body: string, tag: string, opts: { ogOnly?: boolean } = {}): string | null {
  const needle = tag.trim().toLowerCase();
  if (!needle) return null;
  const bare = needle.replace(/^@/, '');
  const hit = (hay: string) => {
    const h = decodeEntities(hay).toLowerCase();
    return h.includes(needle) || (bare !== needle && h.includes(bare));
  };
  for (const prop of ['og:title', 'og:description']) {
    const content = metaContent(body, prop);
    if (content && hit(content)) return prop;
  }
  if (!opts.ogOnly && hit(body)) return 'body';
  return null;
}

function metaContent(html: string, prop: string): string | null {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`,
    'i',
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------- step 2: Browserbase session (probe only)

// Header name and base URL come from reference/raw/browserbase/browserbase_skills (X-BB-API-Key,
// https://api.browserbase.com/v1). The session body `{ projectId }` mirrors bb.sessions.create().
// TODO: drive the session (connectUrl over CDP) and extract caption/tag. Not done today: no SDK in
// the Worker bundle, and Stagehand v4 wants its own extension id on self-created sessions (G3).
async function browserbaseProbe(
  creds: { apiKey: string; projectId?: string },
  timeoutMs: number,
): Promise<{ sessionId?: string; note: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-bb-api-key': creds.apiKey },
      body: JSON.stringify(creds.projectId ? { projectId: creds.projectId } : {}),
    });
    const text = await res.text();
    if (!res.ok) return { note: `session create failed: HTTP ${res.status} ${text.slice(0, 200)}` };
    const id = (JSON.parse(text) as { id?: string }).id;
    return { sessionId: id, note: 'session created; real-browser check available but not implemented (fetch result above is authoritative)' };
  } catch (err) {
    return { note: `session create error: ${errMsg(err)}` };
  } finally {
    clearTimeout(timer);
  }
}
