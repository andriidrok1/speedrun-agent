# Step 1: real creator data + creator list screen

Goal: open `http://localhost:3500/brand/creators` and see about 10 real fitness creators,
ranked, with avg views (30d), engagement, and fair price. The data is saved as `Creator` JSON
so Andrii can build against the same file. Target: done by 1:00 PM.

Why first: it is the only part that needs nothing from Andrii, and it is the start of the demo.

## Tasks

1. **Scaffold** Next.js + Tailwind in `web/`, `npm run dev` on port 3500.
2. **Contract types** in `shared/contract.ts`: `Creator`, `Offer`, `Deal`, copied from BRIEF.md.
   Tell Andrii before changing any field.
3. **Pricing** in `web/lib/pricing.ts`: formula and CPM table from the spec. Check the brief's
   example gives $1,760.
4. **Apify wrapper** in `web/lib/apify.ts`:
   - TikTok and Instagram Reels, one actor call per creator
   - keep posts from the last 30 days (filter in our code too, actor date filters are unverified)
   - normalize to `{ views, likes, comments, ts }`, then build a `Creator`
   - write the result to `web/data/creators/<platform>-<handle>.json`
5. **API route** `GET /api/creators?platform=tiktok&handles=a,b,c`: serve the cache first, scrape
   only what is missing. `?refresh=1` forces a new scrape.
6. **Fallback**: if `APIFY_TOKEN` is not set, serve `web/data/fake-creators.json` so the screen
   works before the token exists.
7. **Screen** `/brand/creators`: cards or table, ranked by fair price, platform badge, the
   numbers, and a "Start negotiation" button (goes to `/deals/[id]` with fake data for now).
8. **Seed list**: about 10 real public fitness handles (mix of TikTok and Instagram,
   50k-500k followers) in `web/data/seed-handles.json`.

## Needs from Raha

- Apify account + token in `web/.env` as `APIFY_TOKEN=...` (git ignores `.env`)
- Pick or approve the seed handles

## Stretch (only if Step 1 lands early)

- Hashtag discovery (`#fitness` on TikTok) instead of a hand-picked list
- `/creator` "What you're worth" page reusing the same scrape

## Next steps after this

Step 2: `/deals/[id]` negotiation + timeline on fake `Offer` / `Deal` JSON.
Step 3: `/brand/setup`, `/creator/setup`, `/brand` budget bar.
Step 4 (after 1:30 PM): swap fake deals for Andrii's `useAgent` connection.
