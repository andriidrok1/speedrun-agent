# Apify actor and plan facts gathered via WebSearch

All items below were fetched via the WebSearch tool on 2026-09-28. apify.com is
blocked from this environment (WebFetch returned EGRESS_BLOCKED for
https://apify.com/apify/instagram-reel-scraper), so none of these could be
opened directly. These are search-snippet summaries, not verbatim pages.
Status of every line: RE-CHECK on the actor page before relying on it.

## Plans

| Fact | Source |
|---|---|
| Free $0 with $5 monthly usage; Starter $29; Scale $199; Business $999 per month | https://scrapegraphai.com/blog/apify-pricing (search snippet) |
| Free plan is permanent, $5 credits a month, no card | same snippet set (scrapegraphai / crawlworks) |
| Scale: $199 credits, CU $0.16 vs $0.20 | same snippet set |
| CU priced from $0.2 on Free and Starter down to $0.13 on Business | same snippet set; matches local doc docs/platform__actors__monetizing__pricing-and-costs__index.mdx |
| CONFLICT: other sources list Starter at $19, $39, or "$35 in monthly credits" | https://use-apify.com/docs/what-is-apify/apify-pricing (title "$0, $19, $199 and $999 Plans"), https://www.capterra.com/p/150854/Apify/pricing/ |
| Official page (not fetchable here) | https://apify.com/pricing |

## Instagram

| Actor | Fact | Source |
|---|---|---|
| apify/instagram-scraper | $2.70 per 1,000 results on Free, $2.30 Starter, $1.90 Scale, $1.50 Business; "verified as of September 9, 2026" by the third-party page | https://use-apify.com/docs/how-to-use-apify/scrape-instagram |
| apify/instagram-scraper | CONFLICT: another snippet says "$0.50 for every 1000 posts" (probably outdated) | https://apify.com/apify/instagram-scraper (search snippet) |
| apify/instagram-scraper | Inputs: `directUrls` (profile URLs/usernames, post/reel URLs, hashtags, places), `resultsType` (posts, reels, comments, mentions, details), `resultsLimit`, `onlyPostsNewerThan` (ISO date or relative like "7 days", "1 month") | https://apify.com/apify/instagram-scraper (search snippet) |
| apify/instagram-scraper | Reads the logged-out version of Instagram; sees what an anonymous visitor sees | https://use-apify.com/docs/how-to-use-apify/scrape-instagram |
| apify/instagram-scraper | Output includes both `videoViewCount` and `videoPlayCount`; an open issue says videoViewCount "is not accurate" | https://apify.com/apify/instagram-scraper/issues/videoviewcount-is-no-Lql5Q75EtXoYSoxo9 |
| apify/instagram-reel-scraper | $2.60 per 1,000 results on Free plan | search snippet for https://apify.com/apify/instagram-reel-scraper |
| apify/instagram-reel-scraper | Accepts usernames, profile URLs, profile IDs, or reel URLs; returns ~40 fields incl. `videoViewCount`, `videoPlayCount`, `ownerUsername`, `timestamp` | https://apify.com/apify/instagram-reel-scraper (search snippet) |
| apify/instagram-reel-scraper | Open issue: some videos do not return videoViewCount | https://apify.com/apify/instagram-reel-scraper/issues/some-videos-not-retu-VsRv3bQietUEMbknb |
| Instagram in general | On reels "Views" is usually blank and "Plays" is populated, so `videoPlayCount` is the usable metric | search snippet, github.com results (instaloader issue #1761 discusses play_count vs view_count: https://github.com/instaloader/instaloader/issues/1761) |
| apify/instagram-profile-scraper | Price not found in search (only third-party alternatives: dami_studio $0.70/1k, blackfalcondata $1/1k) | https://apify.com/apify/instagram-profile-scraper |

## TikTok

| Actor | Fact | Source |
|---|---|---|
| clockworks/tiktok-scraper | "from $1.70 / 1,000 results" | https://apify.com/clockworks/tiktok-scraper (search snippet) |
| clockworks/tiktok-scraper (or profile scraper, snippet ambiguous) | PPE: $0.03 per actor start, $0.004 per dataset item, video download add-on $0.001 | https://apify.com/clockworks/tiktok-profile-scraper / https://use-apify.com/docs/best-apify-actors/best-tiktok-scrapers (snippets) |
| clockworks/tiktok-profile-scraper | 1,000 profiles profile-only (`resultsPerPage: 0`) $0.75 Free / $0.60 Gold; 1,000 profiles with `resultsPerPage: 5` $3.75 Free / $3.00 Gold | https://apify.com/clockworks/tiktok-profile-scraper (search snippet) |
| clockworks/tiktok-profile-scraper | Inputs: `profiles`, `resultsPerPage` (0 = profile only), `oldestPostDateUnified` (only videos uploaded on or after a date) | same |
| clockworks/tiktok-scraper | Inputs: `profiles` (array of usernames), `resultsPerPage`, `profileScrapeSections` (default ["videos"]) | https://apify.com/clockworks/tiktok-scraper (search snippet) |

## X / Twitter

| Actor | Fact | Source |
|---|---|---|
| apidojo/tweet-scraper (Tweet Scraper V2) | $0.40 per 1,000 tweets, flat on every plan | https://apify.com/apidojo/tweet-scraper, https://use-apify.com/docs/best-apify-actors/best-twitter-scrapers |
| apidojo/tweet-scraper | Output: id, text, createdAt, author, likeCount, retweetCount, replyCount, `viewCount`, url | same (snippet) |
| apidojo/tweet-scraper | Profile scraping via `twitterHandles` or `startUrls`: $0.016 per profile, first 40 tweets free, then $0.0004 each (snippet, possibly a different apidojo actor) | same |
| apidojo/tweet-scraper | Free plan: demo mode only, up to 5 runs/month, max 10 items per run; API use needs paid plan | https://apify.com/apidojo/tweet-scraper/issues/you-cannot-use-the-a-ku5OYRuuL52RLZgzw |
| apidojo/twitter-scraper-lite | $0.18 per 1,000 tweets, event-based pricing; `maxItems` caps spend | https://apify.com/apidojo/twitter-scraper-lite (snippet) |

## LinkedIn

| Actor | Fact | Source |
|---|---|---|
| harvestapi/linkedin-profile-posts | $0.002 per post ($2 per 1,000), no cookies | https://apify.com/harvestapi/linkedin-profile-posts (snippet) |
| harvestapi/linkedin-profile-posts | Inputs: `maxPosts` (0 = all), `postedLimitDate` (date string or timestamp), `includeQuotePosts`, `includeReposts` | same (snippet) |
| harvestapi/linkedin-profile-posts | Output: post text, likes, comments, reactions, dates, links | same (snippet) |
| harvestapi LinkedIn profile scraper | $4 per 1k profiles basic | https://github.com/HarvestAPI/apify-linkedin-profile (search title) |
| LinkedIn in general | Post impressions/views are owner-only; public scrapers get reactions, comments, reposts only | https://apify.com/apimaestro/linkedin-profile-posts/issues/why-i-cant-see-the-i-0Zi7FEkbsMixINc2f |
