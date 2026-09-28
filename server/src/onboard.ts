// POST /onboard: free text (plus an optional website or Instagram link) -> a filled onboarding form.
// The form shapes mirror BrandForm / CreatorForm in web/src/lib/onboarding/profiles.ts.
import { createClient, MAX_OUTPUT_TOKENS } from './agents/llm';

export type OnboardSide = 'brand' | 'creator';
type Form = Record<string, string | number | boolean>;
type Field = { type: 'string' | 'number' | 'boolean'; description: string };

const BRAND_FIELDS: Record<string, Field> = {
  name: { type: 'string', description: 'Brand name. Public.' },
  site: { type: 'string', description: 'Brand website URL, empty if unknown. Public.' },
  category: { type: 'string', description: 'What the brand sells, short, e.g. "apparel", "software", "beauty". Public.' },
  campaignName: { type: 'string', description: 'Short campaign name, e.g. "Fall launch". Public.' },
  goal: { type: 'string', description: 'One sentence campaign goal. Public.' },
  audience: { type: 'string', description: 'Target audience, e.g. "US students, 18 to 24". Public.' },
  voice: { type: 'string', description: 'How the brand talks, one or two sentences. Public.' },
  creators: { type: 'number', description: 'How many creators to hire.' },
  totalBudget: { type: 'number', description: 'PRIVATE. Total cash budget in USD for all creators.' },
  maxPerCreator: { type: 'number', description: 'PRIVATE. Most cash in USD the agent may pay one creator. If not stated, about totalBudget / creators.' },
  startingOffer: { type: 'number', description: 'PRIVATE. Cash the agent opens with per creator in USD. If not stated, about 40 to 50 percent of maxPerCreator.' },
  reels: { type: 'number', description: 'Reels wanted per creator.' },
  stories: { type: 'number', description: 'Stories wanted per creator.' },
  products: {
    type: 'string',
    description: 'Things to offer besides cash, one per line as "Name, retail price USD, your cost USD". Example: "Free year of Pro, 120, 5". Empty if none.',
  },
  affiliateMin: { type: 'number', description: 'Lowest affiliate commission percent offered, 0 if no affiliate.' },
  affiliateMax: { type: 'number', description: 'Highest affiliate commission percent offered, 0 if no affiliate.' },
  perks: { type: 'string', description: 'Non-cash perks, comma separated, e.g. "Invite to launch event". Empty if none.' },
  noGos: { type: 'string', description: 'Things the brand refuses, comma separated, e.g. "No competitor mentions".' },
};

const CREATOR_FIELDS: Record<string, Field> = {
  handle: { type: 'string', description: 'Instagram handle without the @. Public.' },
  name: { type: 'string', description: 'Display name, empty if unknown. Public.' },
  niche: { type: 'string', description: 'Content niche, short, e.g. "lifestyle and tech". Public.' },
  voice: { type: 'string', description: 'How the creator talks to brands, one or two sentences in first person. Public.' },
  minReel: { type: 'number', description: 'PRIVATE. Lowest USD accepted for one reel. If not stated, about 75 to 80 percent of idealReel.' },
  minStory: { type: 'number', description: 'PRIVATE. Lowest USD accepted for one story. If not stated, about 15 percent of minReel.' },
  minPost: { type: 'number', description: 'PRIVATE. Lowest USD accepted for one feed post. If not stated, about 40 percent of minReel.' },
  idealReel: { type: 'number', description: 'Public rate card: USD asked for one reel.' },
  idealStory: { type: 'number', description: 'Public rate card: USD asked for one story. If not stated, about 18 to 20 percent of idealReel.' },
  idealPost: { type: 'number', description: 'Public rate card: USD asked for one feed post. If not stated, about 45 percent of idealReel.' },
  openToProducts: { type: 'boolean', description: 'PRIVATE. Whether free products or services can count toward the price. Default true.' },
  openToAffiliate: { type: 'boolean', description: 'PRIVATE. Whether affiliate commission can count toward the price. Default true.' },
  refuses: { type: 'string', description: 'PRIVATE. Categories or brands never worked with, comma separated.' },
  dealbreakers: { type: 'string', description: 'PRIVATE. Terms always refused, comma separated, e.g. "perpetual usage rights".' },
  favoriteBrands: { type: 'string', description: 'PRIVATE. Brands the creator would go below their normal minimum for, comma separated. Empty if none.' },
  favoriteMinReel: { type: 'number', description: 'PRIVATE. Lowest USD for one reel from a favorite brand, at most minReel. 0 if no favorite brands.' },
  favoriteMinStory: { type: 'number', description: 'PRIVATE. Lowest USD for one story from a favorite brand, at most minStory. 0 if no favorite brands.' },
  favoriteMinPost: { type: 'number', description: 'PRIVATE. Lowest USD for one feed post from a favorite brand, at most minPost. 0 if no favorite brands.' },
};

const FIELDS: Record<OnboardSide, Record<string, Field>> = { brand: BRAND_FIELDS, creator: CREATOR_FIELDS };

function schemaFor(side: OnboardSide) {
  const fields = FIELDS[side];
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(fields),
    properties: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { type: f.type, description: f.description }])),
  };
}

const SYSTEM = `You fill in an onboarding profile for an influencer marketing app where AI agents negotiate paid deals between brands and creators.
Read the user's own words (and any website text) and return every field of the JSON schema.
Rules:
- Use numbers the user gives exactly. Money is USD whole dollars. "10k" means 10000.
- Infer sensible values for anything missing, from the text and typical market rates. Never leave a number at 0 unless it really is 0.
- Fields marked PRIVATE are only ever seen by the user's own agent: budgets, maximums, minimums. Public fields are shown to the other side.
- Brand: startingOffer <= maxPerCreator <= totalBudget. If only a total and a creator count are given, maxPerCreator is about total / creators and startingOffer about 40 percent of maxPerCreator.
- Creator: each minimum is at most its ideal price. "Never under X" is the minimum; "I charge about Y" is the ideal.
- Creator favorite brands: if they would go lower for some brands, list them in favoriteBrands. If they give a number for those brands, use it for favoriteMinReel and scale story and post by the same ratio to the normal minimums. "Even below X" with no other number means about 70 percent of X for the reel (e.g. "even below 700" gives about 500). If they give no number at all, use about 70 percent of each normal minimum. With no favorite brands, favoriteBrands is empty and the three favorite minimums are 0.
- Keep text fields short and plain. Do not use em dashes or en dashes; use commas or hyphens.
- If a current profile is given, update it with what the new text says and keep everything else as it is.`;

const INSTAGRAM = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})/i;

export function instagramHandle(url: string): string | undefined {
  const m = url.trim().match(INSTAGRAM);
  const h = m?.[1];
  return h && !['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(h.toLowerCase()) ? h : undefined;
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Title, meta description and ~6 KB of visible text from a web page. Undefined on any failure. */
export async function fetchSiteContext(url: string): Promise<string | undefined> {
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return undefined;
  }
  try {
    const res = await fetch(target.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; creator-deals-onboarding)', accept: 'text/html' },
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return undefined;
    const html = (await res.text()).slice(0, 400_000);
    const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '');
    const desc = decode(
      html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
        ?? html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i)?.[1]
        ?? '',
    );
    const text = decode(
      html
        .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    ).slice(0, 6000);
    return `URL: ${res.url}\nTitle: ${title}\nDescription: ${desc}\nVisible text: ${text}`;
  } catch {
    return undefined;
  }
}

// ---- clamping ------------------------------------------------------------------------------------

const n = (v: unknown, fallback: number, max = 10_000_000) => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(0, Math.round(x))) : fallback;
};
const s = (v: unknown, fallback = '') => (typeof v === 'string' ? v.replace(/[\u2013\u2014]/g, '-').trim() : fallback);
const b = (v: unknown, fallback = true) => (typeof v === 'boolean' ? v : fallback);

function cleanBrand(raw: Record<string, unknown>): Form {
  const creators = Math.max(1, n(raw.creators, 5, 1000));
  const totalBudget = n(raw.totalBudget, 10_000);
  const maxPerCreator = Math.min(totalBudget, n(raw.maxPerCreator, Math.round(totalBudget / creators)));
  const startingOffer = Math.min(maxPerCreator, n(raw.startingOffer, Math.round(maxPerCreator * 0.4)));
  let reels = n(raw.reels, 1, 50);
  const stories = n(raw.stories, 3, 50);
  if (reels + stories === 0) reels = 1;
  const affiliateMin = n(raw.affiliateMin, 0, 100);
  return {
    name: s(raw.name),
    site: s(raw.site),
    category: s(raw.category),
    campaignName: s(raw.campaignName),
    goal: s(raw.goal),
    audience: s(raw.audience),
    voice: s(raw.voice),
    creators,
    totalBudget,
    maxPerCreator,
    startingOffer,
    reels,
    stories,
    products: s(raw.products),
    affiliateMin,
    affiliateMax: Math.max(affiliateMin, n(raw.affiliateMax, affiliateMin, 100)),
    perks: s(raw.perks),
    noGos: s(raw.noGos),
  };
}

function cleanCreator(raw: Record<string, unknown>): Form {
  const idealReel = n(raw.idealReel, 1000);
  const idealStory = n(raw.idealStory, Math.round(idealReel * 0.2));
  const idealPost = n(raw.idealPost, Math.round(idealReel * 0.45));
  const minReel = Math.min(idealReel, n(raw.minReel, Math.round(idealReel * 0.8)));
  const minStory = Math.min(idealStory, n(raw.minStory, Math.round(idealStory * 0.75)));
  const minPost = Math.min(idealPost, n(raw.minPost, Math.round(idealPost * 0.8)));
  return {
    handle: s(raw.handle).replace(/^@/, ''),
    name: s(raw.name),
    niche: s(raw.niche),
    voice: s(raw.voice),
    minReel,
    minStory,
    minPost,
    idealReel,
    idealStory,
    idealPost,
    openToProducts: b(raw.openToProducts),
    openToAffiliate: b(raw.openToAffiliate),
    refuses: s(raw.refuses),
    dealbreakers: s(raw.dealbreakers),
    ...cleanFavorites(raw, minReel, minStory, minPost),
  };
}

/** Favorite brands get their own lower floors: 0 <= favorite min <= normal min, all 0 when there are none. */
function cleanFavorites(raw: Record<string, unknown>, minReel: number, minStory: number, minPost: number): Form {
  const favoriteBrands = s(raw.favoriteBrands);
  if (!favoriteBrands) return { favoriteBrands: '', favoriteMinReel: 0, favoriteMinStory: 0, favoriteMinPost: 0 };
  return {
    favoriteBrands,
    favoriteMinReel: Math.min(minReel, n(raw.favoriteMinReel, Math.round(minReel * 0.7))),
    favoriteMinStory: Math.min(minStory, n(raw.favoriteMinStory, Math.round(minStory * 0.7))),
    favoriteMinPost: Math.min(minPost, n(raw.favoriteMinPost, Math.round(minPost * 0.7))),
  };
}

// ---- entry point ---------------------------------------------------------------------------------

export async function onboard(input: {
  apiKey: string;
  model?: string;
  side: OnboardSide;
  text: string;
  url?: string;
  current?: Record<string, unknown>;
}): Promise<{ form: Form }> {
  const { side, text } = input;
  const url = input.url?.trim() || undefined;
  const handle = url ? instagramHandle(url) : undefined;
  const site = url && !handle ? await fetchSiteContext(url) : undefined;

  const parts = [`Side: ${side}`, `User text:\n${text.slice(0, 4000)}`];
  if (handle) parts.push(`Instagram handle from the link: ${handle}`);
  else if (url) parts.push(site ? `Website context:\n${site}` : `Website link (could not be read): ${url}`);
  if (input.current) parts.push(`Current profile (update it, keep what the text does not change):\n${JSON.stringify(input.current).slice(0, 4000)}`);

  const client = createClient(input.apiKey, input.model || undefined);
  const completion = await client.openai.chat.completions.create({
    model: client.model,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    ...(/^(gpt-5|o\d)/.test(client.model) ? { reasoning_effort: 'low' as const } : {}),
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: parts.join('\n\n') },
    ],
    response_format: { type: 'json_schema', json_schema: { name: `${side}_form`, strict: true, schema: schemaFor(side) } },
  });
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error(`onboard: empty model reply (finish_reason ${completion.choices[0]?.finish_reason})`);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error('onboard: model reply was not JSON');
  }
  if (side === 'brand') {
    const form = cleanBrand(raw);
    if (!form.site && url) form.site = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return { form };
  }
  const form = cleanCreator(raw);
  if (handle) form.handle = handle;
  return { form };
}
