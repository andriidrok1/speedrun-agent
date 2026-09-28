// Brainbase proxy: the web app starts the brand-manager agent (brainbase/) as a Brainbase task and
// polls its activity. The PAT stays server-side (BRAINBASE_API_KEY in .dev.vars / wrangler secret).
//   POST /brainbase/campaign   -> { taskId }
//   GET  /brainbase/tasks/:id  -> { status, done, events, report? }
import type { Hono } from 'hono';
import type { Env } from './index';
import type { Creator } from './types';

type App = Hono<{ Bindings: Env }>;
type Obj = Record<string, unknown>;

const BASE = 'https://api.brainbaselabs.com/v2';
const DEFAULT_AGENT = '0169c39a-33c1-4712-8e4e-d896814f602a'; // brainbase/brainbase.agent.yaml
const TERMINAL = new Set(['success', 'fail', 'need_more_info', 'failed', 'error', 'cancelled', 'canceled']);

export type BrainbaseEvent = {
  type: 'tool' | 'assistant' | 'user';
  /** tool name without the mcp__creator-deals__ prefix */
  name?: string;
  args?: Obj;
  text?: string;
  /** parsed tool output (JSON when possible, long arrays trimmed) */
  result?: unknown;
  status?: 'running' | 'success' | 'error';
  ts: string;
};

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

async function bb(env: Env, path: string, init: RequestInit = {}): Promise<Obj> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.BRAINBASE_API_KEY}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error body, reported below
  }
  if (!res.ok) {
    const detail = isObj(json) ? (json.detail ?? json.error ?? json.message) : text.slice(0, 300);
    throw new Error(`[502] brainbase ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return isObj(json) ? json : {};
}

// ---- task message --------------------------------------------------------------------------------

export type CampaignInput = {
  brandSlug?: string;
  brand?: Obj;
  budgetUsd?: number;
  headcount?: number;
  /** Scraped creators (Creator objects) or bundled creator slugs. */
  creators?: (Creator | string)[];
};

const slugOf = (handle: string) => handle.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function campaignMessage(input: CampaignInput): { title: string; message: string } {
  const brandName = isObj(input.brand) && isObj(input.brand.public) && typeof input.brand.public.name === 'string'
    ? input.brand.public.name
    : input.brandSlug ?? 'marine-layer';
  const creators = input.creators ?? [];
  const headcount = input.headcount ?? Math.max(1, creators.length || 3);
  const lines: string[] = [];
  lines.push(`Run the ${brandName} influencer campaign end to end.`);
  lines.push('');
  if (input.brand) {
    lines.push('Brand: an onboarded brand. Call create_campaign with `brand` set to this exact JSON object (do not use brandSlug):');
    lines.push('```json', JSON.stringify(input.brand), '```');
  } else {
    lines.push(`Brand: bundled brand slug \`${input.brandSlug ?? 'marine-layer'}\` (create_campaign with brandSlug).`);
  }
  lines.push(`Budget: ${input.budgetUsd ?? 'use the brand default'} USD (budgetUsd).`);
  lines.push(`Headcount: select at most ${headcount} creator(s).`);
  lines.push('');
  if (creators.length === 0) {
    lines.push('Creators: none given. Call list_creators and consider every bundled creator.');
  } else {
    lines.push('Creators to consider:');
    for (const c of creators) {
      if (typeof c === 'string') {
        lines.push(`- bundled creator slug \`${c}\` (start_deal with creatorSlug only)`);
      } else {
        const creator = { handle: c.handle, platform: c.platform, followers: c.followers, avgViews30d: c.avgViews30d, engagement: c.engagement, fairPrice: c.fairPrice };
        lines.push(`- ${c.handle}: start_deal with creatorSlug \`${slugOf(c.handle)}\` and creator = ${JSON.stringify(creator)}`);
      }
    }
  }
  lines.push('');
  lines.push('Follow your instructions: evaluate the creators, negotiate, pick winners with evaluate_campaign and match_market, fund and verify (mock true, https://www.instagram.com/p/demo/) only the selected agreed deals, then finish with the report table.');
  return { title: `${brandName} campaign (${creators.length || 'all'} creators)`, message: lines.join('\n') };
}

// ---- event normalization -------------------------------------------------------------------------

const toolName = (n: unknown) => (typeof n === 'string' ? n.replace(/^mcp__.+?__/, '') : 'tool');

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((p) => (isObj(p) ? (typeof p.content === 'string' ? p.content : typeof p.text === 'string' ? p.text : '') : '')).join('');
}

/** Tool output text -> JSON, with the bulky transcript fields reduced to counts. */
function compactResult(output: unknown): unknown {
  const text = Array.isArray(output) ? output.map((o) => (isObj(o) && typeof o.text === 'string' ? o.text : '')).join('') : typeof output === 'string' ? output : '';
  if (!text) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text.slice(0, 600);
  }
  const trim = (v: unknown): unknown => {
    if (!isObj(v)) return v;
    const out: Obj = {};
    for (const [k, val] of Object.entries(v)) {
      if ((k === 'turns' || k === 'transcript') && Array.isArray(val)) out[`${k}Count`] = val.length;
      else out[k] = val;
    }
    return out;
  };
  return Array.isArray(parsed) ? parsed.map(trim) : trim(parsed);
}

export function normalizeEvents(items: Obj[]): { events: BrainbaseEvent[]; report?: string } {
  const sorted = [...items].sort((a, b) => String(a.ts ?? '').localeCompare(String(b.ts ?? '')));
  const events: BrainbaseEvent[] = [];
  const byTool = new Map<string, BrainbaseEvent>();
  let report: string | undefined;
  for (const e of sorted) {
    const data = isObj(e.data) ? e.data : {};
    const ts = String(e.ts ?? e.received_at ?? '');
    const toolId = typeof e.tool_id === 'string' ? e.tool_id : '';
    switch (e.type) {
      case 'user.message':
        events.push({ type: 'user', text: textOf(data.content), ts });
        break;
      case 'assistant.message': {
        const text = textOf(data.content).trim();
        if (text) {
          events.push({ type: 'assistant', text, ts });
          report = text; // the last assistant message is the final report
        }
        break;
      }
      case 'tool_call.start': {
        const ev: BrainbaseEvent = { type: 'tool', name: toolName(data.name), args: isObj(data.args) ? data.args : {}, status: 'running', ts };
        events.push(ev);
        if (toolId) byTool.set(toolId, ev);
        break;
      }
      case 'tool_call.end': {
        let ev = toolId ? byTool.get(toolId) : undefined;
        if (!ev) {
          ev = { type: 'tool', name: toolName(data.name), args: {}, status: 'running', ts };
          events.push(ev);
        }
        // start events often carry empty args; the end event has the real ones
        if (isObj(data.args) && Object.keys(data.args).length > 0) ev.args = data.args;
        const result = compactResult(data.output);
        const failed = data.status !== 'success' || (typeof result === 'string' && /error|required|unknown|refuse/i.test(result));
        ev.status = failed ? 'error' : 'success';
        ev.result = result;
        break;
      }
      default:
        break; // chunks, progress, mcp.status, idle
    }
  }
  return { events, report };
}

// ---- routes --------------------------------------------------------------------------------------

export function mountBrainbase(app: App) {
  app.post('/brainbase/campaign', async (c) => {
    if (!c.env.BRAINBASE_API_KEY) return c.json({ error: 'BRAINBASE_API_KEY is not set on the server (server/.dev.vars)' }, 503);
    let b: Obj;
    try {
      const raw: unknown = await c.req.json();
      b = isObj(raw) ? raw : {};
    } catch {
      b = {};
    }
    const input: CampaignInput = {
      brandSlug: typeof b.brandSlug === 'string' && b.brandSlug.trim() ? b.brandSlug.trim() : undefined,
      brand: isObj(b.brand) ? b.brand : undefined,
      budgetUsd: typeof b.budgetUsd === 'number' && b.budgetUsd > 0 ? b.budgetUsd : undefined,
      headcount: typeof b.headcount === 'number' && Number.isInteger(b.headcount) && b.headcount > 0 ? b.headcount : undefined,
      creators: Array.isArray(b.creators)
        ? b.creators.filter((x): x is Creator | string => typeof x === 'string' || (isObj(x) && typeof x.handle === 'string' && typeof x.fairPrice === 'number'))
        : undefined,
    };
    if (!input.brand && !input.brandSlug) input.brandSlug = 'marine-layer';
    const { title, message } = campaignMessage(input);
    const task = await bb(c.env, '/tasks', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        agent_id: c.env.BRAINBASE_AGENT_ID || DEFAULT_AGENT,
        title,
        initial_messages: [{ role: 'user', content: message }],
        auto_run: true,
      }),
    });
    if (typeof task.id !== 'string') return c.json({ error: 'brainbase did not return a task id' }, 502);
    return c.json({ taskId: task.id, status: task.status ?? 'queued', title, message }, 201);
  });

  app.get('/brainbase/tasks/:id', async (c) => {
    if (!c.env.BRAINBASE_API_KEY) return c.json({ error: 'BRAINBASE_API_KEY is not set on the server (server/.dev.vars)' }, 503);
    const id = encodeURIComponent(c.req.param('id'));
    const [task, ev] = await Promise.all([
      bb(c.env, `/tasks/${id}`),
      bb(c.env, `/tasks/${id}/events?order_by_received=true&limit=200`),
    ]);
    const status = typeof task.status === 'string' ? task.status : 'unknown';
    const items = Array.isArray(ev.items) ? ev.items.filter(isObj) : [];
    const { events, report } = normalizeEvents(items);
    const done = TERMINAL.has(status);
    return c.json({
      taskId: c.req.param('id'),
      title: task.title ?? null,
      status,
      done,
      createdAt: task.created_at ?? null,
      terminalAt: isObj(task.status_info) ? (task.status_info.terminal_at ?? null) : null,
      events,
      report: done ? report : undefined,
    });
  });
}
