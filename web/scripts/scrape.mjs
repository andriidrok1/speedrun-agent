// Scrape real Instagram creators with Apify and write data/creators.json in the Creator shape.
//
//   npm run scrape               seeds + up to 6 related profiles
//   npm run scrape -- --extra 0  seeds only
//
// Token: APIFY_TOKEN env var, or the one `apify login` saved in ~/.apify/auth.json.

import { ApifyClient } from "apify-client";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DAYS = 30;
const MIN_FOLLOWERS = 10_000;
const MAX_FOLLOWERS = 3_000_000;
const extraArg = process.argv.indexOf("--extra");
const EXTRA = extraArg > -1 ? Number(process.argv[extraArg + 1]) : 6;

function token() {
  if (process.env.APIFY_TOKEN) return process.env.APIFY_TOKEN;
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".apify", "auth.json"), "utf8")).token;
  } catch {
    throw new Error("No Apify token. Run `apify login` or set APIFY_TOKEN in web/.env");
  }
}

const client = new ApifyClient({ token: token() });

async function run(actor, input) {
  console.log(`> ${actor}`, JSON.stringify(input).slice(0, 120));
  const r = await client.actor(actor).call(input);
  const { items } = await client.dataset(r.defaultDatasetId).listItems();
  console.log(`  ${items.length} items, run ${r.id}`);
  return items;
}

// Same formula as src/lib/pricing.ts (kept in sync by hand, it is 3 lines)
const CPM = { fitness: 20, beauty: 25, tech: 30, finance: 35, food: 15, gaming: 12, comedy: 15, lifestyle: 18, other: 18 };
const mult = (e) => Math.min(1.3, Math.max(0.8, 1 + (e - 0.04) * 5));
const price = (views, e, niche) => Math.round((views / 1000) * (CPM[niche] ?? CPM.other) * mult(e));

async function saveAvatar(handle, url) {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    fs.writeFileSync(path.join(ROOT, "public", "avatars", `${handle}.jpg`), Buffer.from(await res.arrayBuffer()));
    return `/avatars/${handle}.jpg`;
  } catch {
    return undefined;
  }
}

const seeds = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "seed-handles.json"), "utf8"));
const nicheOf = Object.fromEntries(seeds.map((s) => [s.handle, s.niche]));

// 1. Seed profiles
let profiles = await run("apify/instagram-profile-scraper", { usernames: seeds.map((s) => s.handle) });

// 2. Related profiles of the seeds, filtered by follower range
if (EXTRA > 0) {
  const seen = new Set(seeds.map((s) => s.handle));
  const related = [];
  for (const p of profiles) {
    for (const r of p.relatedProfiles ?? []) {
      if (!r.is_private && r.username && !seen.has(r.username)) {
        seen.add(r.username);
        related.push(r.username);
      }
    }
  }
  console.log(`  ${related.length} related candidates`);
  if (related.length) {
    const extra = (await run("apify/instagram-profile-scraper", { usernames: related.slice(0, 20) }))
      .filter((p) => !p.private && p.followersCount >= MIN_FOLLOWERS && p.followersCount <= MAX_FOLLOWERS)
      .slice(0, EXTRA);
    extra.forEach((p) => (nicheOf[p.username] = nicheOf[p.username] ?? "lifestyle"));
    profiles = profiles.concat(extra);
  }
}

// 3. Reels from the last 30 days
const since = Date.now() - DAYS * 24 * 3600 * 1000;
const reels = await run("apify/instagram-reel-scraper", {
  username: profiles.map((p) => p.username),
  resultsLimit: 30,
  onlyPostsNewerThan: new Date(since).toISOString().slice(0, 10),
  skipPinnedPosts: true,
});
fs.mkdirSync(path.join(ROOT, "data", "raw"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data", "raw", "profiles.json"), JSON.stringify(profiles, null, 2));
fs.writeFileSync(path.join(ROOT, "data", "raw", "reels.json"), JSON.stringify(reels, null, 2));

// 4. Build Creator records
const creators = [];
for (const p of profiles) {
  const mine = reels
    .filter((r) => (r.ownerUsername ?? "").toLowerCase() === p.username.toLowerCase())
    .map((r) => ({
      ts: Date.parse(r.timestamp),
      views: r.videoPlayCount ?? r.videoViewCount ?? 0,
      likes: Math.max(0, r.likesCount ?? 0), // hidden likes come back as -1
      comments: r.commentsCount ?? 0,
    }))
    .filter((r) => r.views > 0 && r.ts >= since); // filter here too, actor date filter is unverified
  if (!mine.length) {
    console.log(`  skip @${p.username}: no reels with views in the last ${DAYS} days`);
    continue;
  }
  const avgViews = Math.round(mine.reduce((s, r) => s + r.views, 0) / mine.length);
  const engagement = mine.reduce((s, r) => s + (r.likes + r.comments) / r.views, 0) / mine.length;
  const niche = nicheOf[p.username] ?? "lifestyle";
  creators.push({
    handle: `@${p.username}`,
    platform: "instagram",
    followers: p.followersCount ?? 0,
    avgViews30d: avgViews,
    engagement: Number(engagement.toFixed(4)),
    fairPrice: price(avgViews, engagement, niche),
    name: p.fullName || p.username,
    avatarUrl: await saveAvatar(p.username, p.profilePicUrlHD ?? p.profilePicUrl),
    niche,
    posts30d: mine.length,
    scrapedAt: new Date().toISOString(),
  });
}

creators.sort((a, b) => b.fairPrice - a.fairPrice);
fs.writeFileSync(path.join(ROOT, "data", "creators.json"), JSON.stringify(creators, null, 2) + "\n");
console.log(`\nWrote ${creators.length} creators to data/creators.json`);
console.table(creators.map((c) => ({ handle: c.handle, followers: c.followers, avgViews: c.avgViews30d, eng: c.engagement, price: c.fairPrice, reels: c.posts30d })));
