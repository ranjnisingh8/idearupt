import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronAuth } from "../_shared/cron-auth.ts";

// Dynamic CORS — scraper is called by cron (service role), not browser
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https:\/\/.*\.lovable\.app$/,
  /^https:\/\/.*\.lovable\.dev$/,
  /^https:\/\/hseuprmcguiqgrdcqexi\.supabase\.co$/,
  /^https:\/\/idearupt\.com$/,
  /^https:\/\/www\.idearupt\.com$/,
  /^https:\/\/idearupt\.ai$/,
  /^https:\/\/www\.idearupt\.ai$/,
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const isAllowed = ALLOWED_ORIGINS.some((p) => p.test(origin));
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// ── Configuration ──────────────────────────────────────────────
const MIN_UPVOTES = 3; // Minimum quality bar for Lobsters/Dev.to (lower since these have less traffic)
const MIN_HN_POINTS = 30;
const MIN_OVERALL_SCORE = 7.0;
const BATCH_SIZE = 5;
const MAX_POSTS_TO_PROCESS = 15; // Aggressive cap to stay under 60s timeout
const GH_MIN_STARS = 50;

// ── Types ──────────────────────────────────────────────────────
interface RawPost {
  title: string;
  body: string;
  source_url: string;
  source_type: "reddit" | "hackernews" | "producthunt" | "github" | "indiehackers" | "stackoverflow";
  source_subreddit?: string;
  upvotes: number;
  comments_count: number;
  source_created_at: string;
  author?: string;
}

interface RealFeedback {
  quote: string;
  source: string;
  upvotes: number;
  sentiment: string;
}

interface ScoredIdea {
  post_index: number;
  idea_title: string;
  one_liner: string;
  description: string;
  overall_score: number;
  pain_score: number;
  trend_score: number;
  competition_score: number;
  revenue_potential: number;
  build_difficulty: number;
  category: string;
  estimated_mrr_range: string;
  target_audience: string;
  tags: string[];
  real_feedback?: RealFeedback[];
}

// ── Helpers ────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch with timeout to avoid hanging requests
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Showcase / Launch Post Pre-Filter ─────────────────────────
// These posts describe something the author BUILT, not a PROBLEM they have.
// Filter them out BEFORE sending to Claude to save API calls and avoid false positives.
// NOTE: Only match against TITLE to avoid false positives from body text.
// The Claude prompt also has rejection rules as a second layer.
const SHOWCASE_TITLE_KEYWORDS: string[] = [
  "show hn:",
  "show hn -",
  "show hn –",
  "launch hn:",
  "i built",
  "i made",
  "just launched",
  "here's my",
  "heres my",
  "here is my project",
  "we just released",
  "we just launched",
  "i created this",
  "side project:",
  "my side project",
  "built this in",
  "made this over the weekend",
  "sharing my project",
  "introducing:",
];

/**
 * Returns true if the post looks like a showcase/launch (i.e. "I built X")
 * rather than a complaint or pain point. These should be skipped.
 * Only checks TITLE — body matching was too aggressive and filtered legitimate posts.
 */
function isShowcasePost(post: RawPost): boolean {
  const titleLower = (post.title || "").toLowerCase();
  return SHOWCASE_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw));
}

// ── Lobsters Scraper (HN-like community, free JSON API) ──────
async function scrapeLobsters(logMsg: (msg: string) => void): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const cutoff = Date.now() - 48 * 3600 * 1000; // 48 hours ago

  try {
    const res = await fetchWithTimeout("https://lobste.rs/hottest.json", {}, 10000);
    if (!res.ok) {
      logMsg(`[Lobsters] HTTP ${res.status}`);
      return posts;
    }

    const stories = await res.json();
    for (const s of stories) {
      const createdAt = new Date(s.created_at).getTime();
      if (createdAt < cutoff) continue;
      if ((s.score || 0) < 10) continue; // Only quality stories

      posts.push({
        title: s.title || "",
        body: (s.description_plain || s.title || "").substring(0, 2000),
        source_url: s.url || s.short_id_url || `https://lobste.rs/s/${s.short_id}`,
        source_type: "reddit", // Map to reddit source_type for DB constraint compatibility
        source_subreddit: "lobste.rs",
        upvotes: s.score || 0,
        comments_count: s.comment_count || 0,
        source_created_at: s.created_at,
        author: s.submitter_user,
      });
    }
    logMsg(`[Lobsters] ${stories.length} fetched, ${posts.length} qualified`);
  } catch (e) {
    logMsg(`[Lobsters] error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return posts;
}

// ── Dev.to Scraper (developer community, free JSON API) ──────
const DEVTO_TAGS = ["saas", "startup", "indiehacker", "buildinpublic", "sideproject", "ai", "entrepreneur"];

async function scrapeDevTo(logMsg: (msg: string) => void): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const seenUrls = new Set<string>();

  // Fetch multiple tags in parallel
  const results = await Promise.allSettled(
    DEVTO_TAGS.map(async (tag) => {
      try {
        const res = await fetchWithTimeout(
          `https://dev.to/api/articles?tag=${tag}&top=1&per_page=15`,
          { headers: { Accept: "application/json" } },
          10000
        );
        if (!res.ok) {
          logMsg(`[Dev.to] tag=${tag}: HTTP ${res.status}`);
          return [];
        }

        const articles = await res.json();
        const tagPosts: RawPost[] = [];

        for (const a of articles) {
          if (seenUrls.has(a.url)) continue;
          seenUrls.add(a.url);
          if ((a.positive_reactions_count || 0) < 3) continue; // Min quality bar

          tagPosts.push({
            title: a.title || "",
            body: (a.description || a.title || "").substring(0, 2000),
            source_url: a.url || a.canonical_url,
            source_type: "reddit", // Map to reddit source_type for DB constraint compatibility
            source_subreddit: `dev.to/${tag}`,
            upvotes: a.positive_reactions_count || 0,
            comments_count: a.comments_count || 0,
            source_created_at: a.published_timestamp || a.created_at,
            author: a.user?.username,
          });
        }
        return tagPosts;
      } catch (e) {
        logMsg(`[Dev.to] tag=${tag} error: ${e instanceof Error ? e.message : String(e)}`);
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      posts.push(...result.value);
    }
  }

  logMsg(`[Dev.to] ${posts.length} articles scraped from ${DEVTO_TAGS.length} tags`);
  return posts;
}

// ── Hacker News Scraper ────────────────────────────────────────
async function scrapeHN(): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const cutoff = Date.now() / 1000 - 48 * 3600;

  // Fetch top + ask story IDs in parallel
  const [topRes, askRes] = await Promise.all([
    fetchWithTimeout("https://hacker-news.firebaseio.com/v0/topstories.json"),
    fetchWithTimeout("https://hacker-news.firebaseio.com/v0/askstories.json"),
  ]);

  const topIds: number[] = topRes.ok ? await topRes.json() : [];
  const askIds: number[] = askRes.ok ? await askRes.json() : [];
  // Only fetch top 30 + 15 Ask HN to stay fast
  const allIds = [...new Set([...topIds.slice(0, 30), ...askIds.slice(0, 15)])];

  // Fetch ALL stories in parallel (single batch)
  const stories = await Promise.allSettled(
    allIds.map((id) =>
      fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 5000)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );

  for (const result of stories) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const s = result.value;
    if (!s || s.type !== "story" || s.dead || s.deleted) continue;
    if ((s.score || 0) >= MIN_HN_POINTS && s.time >= cutoff) {
      posts.push({
        title: s.title || "",
        body: (s.text || s.title || "").substring(0, 2000),
        source_url: `https://news.ycombinator.com/item?id=${s.id}`,
        source_type: "hackernews",
        upvotes: s.score || 0,
        comments_count: s.descendants || 0,
        source_created_at: new Date(s.time * 1000).toISOString(),
        author: s.by,
      });
    }
  }
  return posts;
}

// ── GitHub Trending Scraper ─────────────────────────────────────
async function scrapeGitHubTrending(): Promise<RawPost[]> {
  const posts: RawPost[] = [];

  try {
    const res = await fetchWithTimeout("https://github.com/trending?since=daily", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    }, 10000);

    if (!res.ok) {
      console.error(`GitHub Trending: HTTP ${res.status}`);
      return posts;
    }

    const html = await res.text();

    // Parse trending repo rows — flexible article matching
    const repoRegex = /<article[^>]*>([\s\S]*?)<\/article>/g;
    let match;

    while ((match = repoRegex.exec(html)) !== null) {
      const block = match[1];

      // Extract repo path
      const linkMatch = block.match(/<h2[^>]*>[\s\S]*?<a\s+href="\/([^"]+)"/);
      const fallbackLink = !linkMatch ? block.match(/href="\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"/) : null;
      const repoFullMatch = linkMatch || fallbackLink;
      if (!repoFullMatch) continue;
      const repoPath = repoFullMatch[1].trim().replace(/\/+$/, "");
      if (!repoPath.includes("/") || repoPath.startsWith("trending") || repoPath.startsWith("topics")) continue;
      const repoName = repoPath.split("/").pop() || repoPath;

      // Extract description
      const descMatch = block.match(/<p[^>]*class="[^"]*(?:col-9|color-fg-muted|my-1)[^"]*"[^>]*>([\s\S]*?)<\/p>/)
        || block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      // Extract stars today
      const starsToday = block.match(/([\d,]+)\s*stars?\s*today/i);
      const todayStars = starsToday ? parseInt(starsToday[1].replace(/,/g, ""), 10) : 0;

      // Extract total stars
      const totalStarsMatch = block.match(/href="\/[^"]*\/stargazers"[\s\S]*?>([\s\S]*?)<\/a>/);
      let totalStars = 0;
      if (totalStarsMatch) {
        totalStars = parseInt(totalStarsMatch[1].replace(/<[^>]+>/g, "").replace(/[,\s]/g, ""), 10) || 0;
      }

      // Extract language
      const langNameMatch = block.match(/itemprop="programmingLanguage"[^>]*>([^<]+)/);
      const repoLang = langNameMatch ? langNameMatch[1].trim() : "";

      if (todayStars >= GH_MIN_STARS || totalStars >= 500) {
        const sourceUrl = `https://github.com/${repoPath}`;
        if (posts.some((p) => p.source_url === sourceUrl)) continue;

        posts.push({
          title: repoName,
          body: `GitHub trending repo: ${repoPath}. ${description}. Language: ${repoLang}. Stars today: ${todayStars}. Total stars: ${totalStars}.`.substring(0, 2000),
          source_url: sourceUrl,
          source_type: "github",
          upvotes: todayStars || totalStars,
          comments_count: 0,
          source_created_at: new Date().toISOString(),
          author: repoPath.split("/")[0],
        });
      }
    }

    // GitHub Trending parsed count tracked in logMsg
  } catch (e) {
    console.error("GitHub Trending error:", e instanceof Error ? e.message : e);
  }

  return posts;
}

// ── Product Hunt Scraper (via frontend GraphQL API) ────────────
async function scrapeProductHunt(logMsg: (msg: string) => void): Promise<RawPost[]> {
  const posts: RawPost[] = [];

  try {
    // Use PH's internal frontend GraphQL API — not behind Cloudflare
    const query = `query HomefeedQuery {
      homefeed(first: 20) {
        edges {
          node {
            ... on Post {
              id
              name
              tagline
              slug
              votesCount
              commentsCount
              createdAt
              url
              website
              user { name }
              topics(first: 3) { edges { node { name } } }
            }
          }
        }
      }
    }`;

    const res = await fetchWithTimeout("https://www.producthunt.com/frontend/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        Origin: "https://www.producthunt.com",
        Referer: "https://www.producthunt.com/",
      },
      body: JSON.stringify({ query, variables: {} }),
    }, 12000);

    if (!res.ok) {
      logMsg(`[PH] GraphQL HTTP ${res.status}`);
      // Fallback: try the RSS feed from alternate aggregators
      return await scrapeProductHuntFallback(logMsg);
    }

    const data = await res.json();
    const edges = data?.data?.homefeed?.edges || [];

    for (const edge of edges) {
      const node = edge?.node;
      if (!node || !node.name || !node.slug) continue;
      if (posts.length >= 15) break;

      const topics = (node.topics?.edges || []).map((e: any) => e.node?.name).filter(Boolean).join(", ");

      posts.push({
        title: node.name,
        body: `Product Hunt launch: ${node.name}. ${node.tagline || ""}. Topics: ${topics || "General"}. A new product seeking user feedback and validation.`,
        source_url: `https://www.producthunt.com/posts/${node.slug}`,
        source_type: "producthunt",
        source_subreddit: "Product Hunt",
        upvotes: node.votesCount || 0,
        comments_count: node.commentsCount || 0,
        source_created_at: node.createdAt || new Date().toISOString(),
        author: node.user?.name,
      });
    }

    logMsg(`[PH] GraphQL: ${edges.length} items, ${posts.length} posts created`);

    // If GraphQL returned nothing, try fallback
    if (posts.length === 0) {
      return await scrapeProductHuntFallback(logMsg);
    }
  } catch (e) {
    logMsg(`[PH] GraphQL error: ${e instanceof Error ? e.message : String(e)}, trying fallback...`);
    return await scrapeProductHuntFallback(logMsg);
  }

  return posts;
}

// PH fallback: scrape from a third-party aggregator or RSS proxy
async function scrapeProductHuntFallback(logMsg: (msg: string) => void): Promise<RawPost[]> {
  const posts: RawPost[] = [];

  try {
    // Use the PH RSS feed via third-party (producthunt has no official RSS)
    // Try RSS Bridge or similar public RSS proxy
    const rssUrl = "https://hnrss.org/newest?q=producthunt.com&count=15";
    const res = await fetchWithTimeout(rssUrl, {
      headers: { Accept: "application/rss+xml, text/xml, */*" },
    }, 10000);

    if (res.ok) {
      const xml = await res.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xml)) !== null && posts.length < 15) {
        const item = match[1];
        const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
        const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);

        const title = titleMatch ? titleMatch[1].trim().replace(/<[^>]+>/g, "") : "";
        const link = linkMatch ? linkMatch[1].trim() : "";
        const desc = descMatch ? descMatch[1].trim().replace(/<[^>]+>/g, "").substring(0, 2000) : "";

        if (!title || !link) continue;

        posts.push({
          title,
          body: (desc || `Product Hunt discussion: ${title}`).substring(0, 2000),
          source_url: link,
          source_type: "producthunt",
          source_subreddit: "Product Hunt",
          upvotes: 0,
          comments_count: 0,
          source_created_at: new Date().toISOString(),
        });
      }
      logMsg(`[PH] Fallback RSS: ${posts.length} posts`);
    } else {
      logMsg(`[PH] Fallback RSS HTTP ${res.status}`);
    }
  } catch (e) {
    logMsg(`[PH] Fallback error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return posts;
}

// ── Indie Hackers Scraper (via Algolia search API) ────────────
// IH uses Algolia for search — public search-only key from their page source
const IH_ALGOLIA_APP_ID = Deno.env.get("IH_ALGOLIA_APP_ID") || "N86T1R3OWZ";
const IH_ALGOLIA_API_KEY = Deno.env.get("IH_ALGOLIA_API_KEY") || "5140dac5e87f47346abbda1a34ee70c3";

async function scrapeIndieHackers(logMsg: (msg: string) => void): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const seenIds = new Set<string>();

  // Search for pain-point / tool-request discussions on IH via Algolia
  const searchQueries = [
    "struggling with",
    "looking for a tool",
    "anyone recommend",
    "frustrated with",
    "alternative to",
  ];

  for (const query of searchQueries) {
    try {
      const res = await fetchWithTimeout(
        `https://${IH_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/posts/query`,
        {
          method: "POST",
          headers: {
            "X-Algolia-Application-Id": IH_ALGOLIA_APP_ID,
            "X-Algolia-API-Key": IH_ALGOLIA_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            hitsPerPage: 10,
            attributesToRetrieve: ["title", "body", "slug", "objectID", "author", "votesCount", "commentCount", "createdAt", "type"],
          }),
        },
        10000
      );

      if (!res.ok) {
        logMsg(`[IH] Algolia HTTP ${res.status} for "${query}"`);
        continue;
      }

      const data = await res.json();
      const hits = data?.hits || [];

      for (const hit of hits) {
        if (posts.length >= 15) break;
        const id = hit.objectID || hit.slug;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const title = (hit.title || "").replace(/<[^>]+>/g, "").trim();
        const body = (hit.body || hit.title || "").replace(/<[^>]+>/g, "").trim().substring(0, 2000);
        if (!title || title.length < 5) continue;

        const slug = hit.slug || hit.objectID;
        const url = slug
          ? `https://www.indiehackers.com/post/${slug}`
          : `https://www.indiehackers.com`;

        posts.push({
          title,
          body: body || title,
          source_url: url,
          source_type: "indiehackers",
          source_subreddit: "Indie Hackers",
          upvotes: hit.votesCount || 0,
          comments_count: hit.commentCount || 0,
          source_created_at: hit.createdAt ? new Date(hit.createdAt * 1000).toISOString() : new Date().toISOString(),
          author: typeof hit.author === "string" ? hit.author : hit.author?.name,
        });
      }

      logMsg(`[IH] Algolia "${query}": ${hits.length} hits, ${posts.length} total`);
    } catch (e) {
      logMsg(`[IH] Algolia "${query}" error: ${e instanceof Error ? e.message : String(e)}`);
    }

    await sleep(200); // Small delay between queries
  }

  // Fallback: try scraping the homepage SSR content if Algolia fails
  if (posts.length === 0) {
    logMsg(`[IH] Algolia returned 0, trying homepage SSR...`);
    try {
      const res = await fetchWithTimeout("https://www.indiehackers.com/", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html",
        },
      }, 10000);

      if (res.ok) {
        const html = await res.text();
        // IH uses Ember FastBoot SSR — look for post links in the server-rendered HTML
        const postRegex = /href="\/post\/([^"]+)"[^>]*>/g;
        const seenSlugs = new Set<string>();
        let match;

        while ((match = postRegex.exec(html)) !== null && posts.length < 15) {
          const slug = match[1].trim();
          if (seenSlugs.has(slug) || slug.length < 3) continue;
          seenSlugs.add(slug);

          // Try to find title near the link
          const titleArea = html.substring(Math.max(0, match.index - 500), match.index + 500);
          const titleMatch = titleArea.match(/class="[^"]*title[^"]*"[^>]*>([^<]{5,150})</);
          const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, " ");

          posts.push({
            title,
            body: title,
            source_url: `https://www.indiehackers.com/post/${slug}`,
            source_type: "indiehackers",
            source_subreddit: "Indie Hackers",
            upvotes: 0,
            comments_count: 0,
            source_created_at: new Date().toISOString(),
          });
        }
        logMsg(`[IH] Homepage SSR: ${posts.length} posts`);
      }
    } catch (e) {
      logMsg(`[IH] Homepage error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return posts;
}

// ── Stack Overflow Scraper (public API, no auth) ──────────────
async function scrapeStackOverflow(logMsg: (msg: string) => void): Promise<RawPost[]> {
  const posts: RawPost[] = [];

  // Search for tool-request / pain-point questions on SO
  // Use sort=activity + fromdate to get RECENT questions (not ancient top-voted ones)
  const sixMonthsAgo = Math.floor((Date.now() - 180 * 24 * 60 * 60 * 1000) / 1000);

  const queries = [
    "is+there+a+tool",
    "looking+for+alternative",
    "why+doesn%27t+this+exist",
    "frustrated+with",
    "anyone+know+a+tool",
  ];

  for (const q of queries) {
    try {
      // Sort by activity (recently active) and limit to posts from last 6 months
      // Use min=2 to get questions with at least 2 upvotes (lower bar for recent posts)
      const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=${q}&site=stackoverflow&pagesize=10&fromdate=${sixMonthsAgo}&filter=withbody`;
      const res = await fetchWithTimeout(url, {
        headers: { Accept: "application/json" },
      }, 10000);

      if (!res.ok) {
        logMsg(`[SO] q="${q}": HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const items = data.items || [];

      for (const item of items) {
        if (posts.length >= 15) break;
        if (posts.some((p) => p.source_url === item.link)) continue;
        // Lower bar to 2 upvotes since we're filtering to recent posts
        if ((item.score || 0) < 2) continue;

        const createdMs = (item.creation_date || 0) * 1000;

        const body = (item.body || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 2000);

        posts.push({
          title: (item.title || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
          body: body || item.title || "",
          source_url: item.link,
          source_type: "stackoverflow",
          source_subreddit: "Stack Overflow",
          upvotes: item.score || 0,
          comments_count: item.answer_count || 0,
          source_created_at: new Date(createdMs).toISOString(),
          author: item.owner?.display_name,
        });
      }

      logMsg(`[SO] q="${q}": ${items.length} items, ${posts.length} total qualified`);
    } catch (e) {
      logMsg(`[SO] q="${q}" error: ${e instanceof Error ? e.message : String(e)}`);
    }

    await sleep(500); // Respect SO rate limits
  }

  logMsg(`[SO] Total: ${posts.length} posts scraped`);
  return posts;
}

// ── Dedup: filter out already-scraped URLs ─────────────────────
async function filterNewPosts(
  posts: RawPost[],
  supabase: any
): Promise<RawPost[]> {
  if (posts.length === 0) return [];

  const urls = posts.map((p) => p.source_url);
  const existingUrls = new Set<string>();

  // Query in batches of 50
  for (let i = 0; i < urls.length; i += 50) {
    const batch = urls.slice(i, i + 50);
    const { data } = await supabase
      .from("ideas")
      .select("source_url")
      .in("source_url", batch);
    if (data) data.forEach((row: { source_url: string }) => existingUrls.add(row.source_url));
  }

  return posts.filter((p) => !existingUrls.has(p.source_url));
}

// ── Claude: batch-score posts ──────────────────────────────────
function buildScoringPrompt(batch: RawPost[]): string {
  const postsText = batch
    .map(
      (p, i) =>
        `POST ${i + 1}:
Title: ${p.title}
Body: ${p.body.substring(0, 800)}
Source: ${p.source_type}${p.source_subreddit ? ` (r/${p.source_subreddit})` : ""}
Upvotes: ${p.upvotes} | Comments: ${p.comments_count}`
    )
    .join("\n\n---\n\n");

  return `Analyze these ${batch.length} posts from Reddit/Hacker News/Product Hunt/GitHub and extract SaaS/startup/tool ideas from them.

For each post, determine if it contains or implies a viable startup/SaaS idea. If it does, score it. If a post is just news, a meme, or has no actionable idea, skip it.

REJECTION RULES — SKIP the post if ANY of these apply:
1. The post is just news, a meme, or has no actionable idea.
2. The post is a "Show HN", "Launch HN", or similar showcase of something the author already built.
3. The post says "I built", "I made", "just launched", "check out my", "here's my project", etc.
4. The post links to a GitHub repo as the primary content (someone sharing their project, NOT complaining about a problem).
5. The post is about an existing open-source tool or product launch — NOT a pain point.
6. The post describes a completed project, weekend hack, or side project the author is showing off.
7. There is no clear PAIN POINT or FRUSTRATION expressed — the author is proud, not struggling.
8. The idea is just "build an AI wrapper around X" with no specific user pain described.
9. The post is a tutorial, guide, or "how I did X" — educational content, not a problem.

POSTS TO ANALYZE:
${postsText}

SCORING RULES:
- Be CRITICAL and CONSERVATIVE. Most ideas are mediocre (5-6 range). Only truly exceptional ideas get 8+.
- Scores are 1-10 scale with one decimal place.
- competition_score: LOWER means less competition (better opportunity).
- build_difficulty: LOWER means easier to build.
- Transform complaints/pain points INTO ideas: "I hate X" becomes "Tool that fixes X".
- idea_title should be a PRODUCT name, not the Reddit post title.
- description must be at least 50 characters.
- one_liner max 120 characters.
- If the problem is niche, trivial, or unlikely to generate revenue, score revenue_potential LOW (1-3).
- MRR estimates MUST be conservative and realistic. A tool for a tiny niche audience should NOT estimate $10K+ MRR. Most small tools realistically make $0-$2K/mo.
- If the idea is more of a general business/life problem (not solvable by software), score overall_score below 5.
- Focus on SOFTWARE-SOLVABLE problems ONLY. Skip complaints about physical services, general life frustrations, political issues, or problems that cannot be addressed with a digital product.
- If the target audience is extremely small (< 1000 potential users), cap revenue_potential at 3.

Respond with ONLY this JSON:
{
  "ideas": [
    {
      "post_index": 1,
      "idea_title": "Product name — sharp subtitle",
      "one_liner": "One sentence pitch, max 120 chars",
      "description": "2-3 sentences: the idea, the problem it solves, who it's for. Min 50 chars.",
      "overall_score": 7.2,
      "pain_score": 8.0,
      "trend_score": 6.5,
      "competition_score": 5.0,
      "revenue_potential": 7.5,
      "build_difficulty": 4.0,
      "category": "Pick ONE: AI/ML, Developer Tools, Marketing, Sales, HR/Recruiting, Finance, Healthcare, Education, E-commerce, Productivity, Communication, Analytics, Security, IoT, Real Estate, Legal, Social, Entertainment, Food/Delivery, Travel, Sustainability, Field Services, Construction, Automotive, Fitness, Agriculture, Logistics",
      "estimated_mrr_range": "$5K-20K",
      "target_audience": "Be hyper specific about who this is for",
      "tags": ["tag1", "tag2", "tag3"],
      "real_feedback": [
        { "quote": "Paraphrase a real complaint or pain point from the post body", "source": "r/subreddit or Hacker News", "upvotes": 123, "sentiment": "frustrated" },
        { "quote": "Another real user quote or paraphrased pain point from the post", "source": "r/subreddit or Hacker News", "upvotes": 45, "sentiment": "desperate" }
      ]
    }
  ]
}

REAL_FEEDBACK RULES:
- Extract 2-4 real_feedback items per idea from the original post body/comments.
- "quote" should paraphrase actual complaints, pain points, or requests from the post. Make them feel real and specific.
- "source" should be the actual source (e.g. "r/SaaS", "Hacker News", "Product Hunt").
- "upvotes" should approximate the post's upvote count or a fraction of it for individual quotes.
- "sentiment" must be one of: "frustrated", "angry", "desperate", "hopeful", "neutral".
- Always include at least 2 real_feedback items per idea.

FINAL CHECK — Before including ANY idea, ask yourself:
"Is this idea based on a PROBLEM someone described, or a PROJECT someone shared?"
- If PROBLEM → include it (score it honestly).
- If PROJECT → REJECT it (do not include it in the ideas array).
We want pain points and frustrations, NOT launch announcements or show-and-tell posts.

Return empty "ideas" array if no posts contain viable ideas. Skip posts that are pure news, memes, showcases, project launches, or have no actionable business idea.`;
}

async function scoreWithClaude(
  posts: RawPost[],
  anthropicKey: string,
  logMsg: (msg: string) => void
): Promise<Array<{ post: RawPost; scores: ScoredIdea }>> {
  const results: Array<{ post: RawPost; scores: ScoredIdea }> = [];

  logMsg(`[Claude] Scoring ${posts.length} posts in ${Math.ceil(posts.length / BATCH_SIZE)} batches`);

  // Score batches SEQUENTIALLY to avoid rate limits and stay under timeout
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const prompt = buildScoringPrompt(batch);

    try {
      logMsg(`[Gemini] Batch ${batchNum}: calling API with ${batch.length} posts...`);
      const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${anthropicKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://idearupt.ai",
          "X-Title": "Idearupt",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 4000,
          messages: [
            { role: "system", content: "You are Idearupt's AI scoring engine. Respond with ONLY valid JSON. No markdown, no backticks, no explanation outside the JSON." },
            { role: "user", content: prompt },
          ],
        }),
      }, 45000); // 45s timeout

      if (!res.ok) {
        const errText = await res.text();
        logMsg(`[Gemini] Batch ${batchNum}: HTTP ${res.status} — ${errText.substring(0, 300)}`);
        continue;
      }

      const data = await res.json();
      const rawText = data.choices?.[0]?.message?.content || "";
      logMsg(`[Gemini] Batch ${batchNum}: got ${rawText.length} chars response`);

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          logMsg(`[Gemini] Batch ${batchNum}: Failed to parse JSON — raw: ${rawText.substring(0, 200)}`);
          continue;
        }
      }

      const ideas: ScoredIdea[] = parsed.ideas || [];
      for (const idea of ideas) {
        const postIndex = idea.post_index - 1;
        if (postIndex >= 0 && postIndex < batch.length) {
          results.push({ post: batch[postIndex], scores: idea });
        }
      }

      logMsg(`[Gemini] Batch ${batchNum}: ${ideas.length} ideas extracted`);
    } catch (e) {
      logMsg(`[Gemini] Batch ${batchNum} ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return results;
}

// ── Insert scored ideas into Supabase ──────────────────────────
async function insertIdeas(
  scoredIdeas: Array<{ post: RawPost; scores: ScoredIdea }>,
  supabase: any,
  logMsg: (msg: string) => void = () => {}
): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Quality filter — overall score threshold
  const passesScore = scoredIdeas.filter(
    ({ scores }) => (scores.overall_score || 0) >= MIN_OVERALL_SCORE
  );
  const belowThreshold = scoredIdeas.length - passesScore.length;
  if (belowThreshold > 0) {
    logMsg(`Quality filter: ${belowThreshold} ideas below ${MIN_OVERALL_SCORE} threshold`);
  }
  skipped += belowThreshold;

  // Additional filter: skip ideas that are hard to build AND low revenue potential
  const qualified = passesScore.filter(({ scores }) => {
    if ((scores.build_difficulty || 0) > 8 && (scores.revenue_potential || 0) < 4) {
      logMsg(`Skipping hard/low-rev idea: build=${scores.build_difficulty} rev=${scores.revenue_potential}`);
      skipped++;
      return false;
    }
    return true;
  });

  for (const { post, scores } of qualified) {
    const title = (scores.idea_title || post.title).substring(0, 200).trim();
    const description = (
      scores.description || post.body || scores.one_liner || "No description"
    )
      .substring(0, 5000)
      .trim();

    if (title.length === 0 || description.length <= 5) {
      logMsg(`Skipping: title or description too short`);
      skipped++;
      continue;
    }

    const row = {
      title,
      one_liner: (scores.one_liner || "").substring(0, 200),
      description,
      category: scores.category || "Other",
      overall_score: scores.overall_score || 0,
      pain_score: scores.pain_score || 0,
      trend_score: scores.trend_score || 0,
      competition_score: scores.competition_score || 0,
      revenue_potential: scores.revenue_potential || 0,
      build_difficulty: scores.build_difficulty || 0,
      problem_size: (scores.build_difficulty || 5) <= 3 ? "small" : (scores.build_difficulty || 5) <= 6 ? "medium" : "large",
      estimated_mrr_range: scores.estimated_mrr_range || null,
      target_audience: scores.target_audience || null,
      tags: Array.isArray(scores.tags) ? scores.tags : [],
      source:
        post.source_type === "reddit"
          ? `r/${post.source_subreddit}`
          : post.source_type === "hackernews"
          ? "Hacker News"
          : post.source_type === "producthunt"
          ? "Product Hunt"
          : post.source_type === "github"
          ? "GitHub Trending"
          : post.source_type === "indiehackers"
          ? "Indie Hackers"
          : post.source_type === "stackoverflow"
          ? "Stack Overflow"
          : post.source_type,
      source_url: post.source_url,
      source_type: post.source_type,
      source_subreddit: post.source_subreddit || null,
      source_title: post.title.substring(0, 300),
      upvotes: post.upvotes,
      comments_count: post.comments_count,
      source_created_at: post.source_created_at,
      validation_data: {
        source_url: post.source_url,
        source_platform: post.source_type,
        engagement_score: Math.min(10, Math.round((post.upvotes / 100) * 10) / 10),
        upvotes: post.upvotes,
        comments: post.comments_count,
        subreddit: post.source_subreddit || null,
        discovered_at: new Date().toISOString(),
        real_feedback: Array.isArray(scores.real_feedback) && scores.real_feedback.length > 0
          ? scores.real_feedback.slice(0, 4).map((f: any) => ({
              quote: String(f.quote || "").substring(0, 500),
              source: String(f.source || post.source_type).substring(0, 100),
              upvotes: typeof f.upvotes === "number" ? f.upvotes : post.upvotes,
              sentiment: ["frustrated", "angry", "desperate", "hopeful", "neutral"].includes(f.sentiment) ? f.sentiment : "neutral",
            }))
          : [
              {
                quote: `Users are actively discussing this problem — ${post.upvotes} upvotes and ${post.comments_count} comments show strong demand.`,
                source: post.source_type === "reddit" ? `r/${post.source_subreddit}` : post.source_type === "hackernews" ? "Hacker News" : post.source_type === "producthunt" ? "Product Hunt" : post.source_type === "github" ? "GitHub" : post.source_type === "indiehackers" ? "Indie Hackers" : post.source_type === "stackoverflow" ? "Stack Overflow" : post.source_type,
                upvotes: post.upvotes,
                sentiment: "frustrated",
              },
            ],
      },
    };

    const { error } = await supabase.from("ideas").insert(row);

    if (error) {
      if (error.code === "23505") {
        logMsg(`Dedup: "${title.substring(0, 50)}..."`);
        skipped++;
      } else {
        logMsg(`[INSERT_ERROR] "${title.substring(0, 50)}" code=${error.code} msg=${error.message} hint=${error.hint || "none"} details=${error.details || "none"}`);
        errors++;
      }
    } else {
      logMsg(`✓ Inserted: "${title.substring(0, 60)}" (${scores.overall_score})`);
      inserted++;
    }
  }

  return { inserted, skipped, errors };
}

// ── Main Handler ───────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const startTime = Date.now();

  try {
    // Auth guard — only allow calls with a valid service_role JWT (from pg_cron)
    const cronAuth = verifyCronAuth(req);
    if (!cronAuth.authorized) {
      return new Response(JSON.stringify({ error: cronAuth.error || "Unauthorized" }), {
        status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // OpenRouter API key for Gemini 2.5 Flash
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("ANTHROPIC KEY") || "";
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "No OpenRouter API key found" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse body — key param is "source": "reddit" | "hackernews" | "github" | "all"
    // Each cron job calls with a single source to stay under 60s timeout
    let source = "reddit"; // default to reddit if no body
    let requestedSubreddits: string[] | null = null;
    try {
      const body = await req.json();
      if (body.source) source = body.source;
      if (body.subreddits && Array.isArray(body.subreddits))
        requestedSubreddits = body.subreddits;
    } catch {
      // No body or invalid JSON — use defaults (reddit)
    }

    const log: string[] = [];
    const logMsg = (msg: string) => {
      log.push(msg);
    };

    logMsg(`[scrape-ideas] Started at ${new Date().toISOString()} — source: ${source}`);

    // ═══ SCRAPE SINGLE SOURCE (stays under 60s) ═══
    let allPosts: RawPost[] = [];
    const sourceCounts: Record<string, number> = {};

    if (source === "reddit" || source === "all") {
      // Reddit blocks data center IPs (403), so we use Lobsters + Dev.to instead
      logMsg(`[Reddit-alt] Scraping Lobsters + Dev.to...`);
      const [lobsterPosts, devtoPosts] = await Promise.all([
        scrapeLobsters(logMsg),
        scrapeDevTo(logMsg),
      ]);
      allPosts.push(...lobsterPosts, ...devtoPosts);
      sourceCounts["Lobsters"] = lobsterPosts.length;
      sourceCounts["DevTo"] = devtoPosts.length;
      logMsg(`[Reddit-alt] ${lobsterPosts.length + devtoPosts.length} total posts`);
    }

    if (source === "hackernews" || source === "all") {
      logMsg(`[HN] Scraping top stories...`);
      const posts = await scrapeHN();
      allPosts.push(...posts);
      sourceCounts["HN"] = posts.length;
      logMsg(`[HN] ${posts.length} posts scraped`);
    }

    if (source === "github" || source === "all") {
      logMsg(`[GH] Scraping trending repos...`);
      const posts = await scrapeGitHubTrending();
      allPosts.push(...posts);
      sourceCounts["GH"] = posts.length;
      logMsg(`[GH] ${posts.length} posts scraped`);
    }

    if (source === "producthunt" || source === "all") {
      logMsg(`[PH] Scraping Product Hunt...`);
      const posts = await scrapeProductHunt(logMsg);
      allPosts.push(...posts);
      sourceCounts["PH"] = posts.length;
      logMsg(`[PH] ${posts.length} posts scraped`);
    }

    if (source === "indiehackers" || source === "all") {
      logMsg(`[IH] Scraping Indie Hackers...`);
      const posts = await scrapeIndieHackers(logMsg);
      allPosts.push(...posts);
      sourceCounts["IH"] = posts.length;
      logMsg(`[IH] ${posts.length} posts scraped`);
    }

    if (source === "stackoverflow" || source === "all") {
      logMsg(`[SO] Scraping Stack Overflow...`);
      const posts = await scrapeStackOverflow(logMsg);
      allPosts.push(...posts);
      sourceCounts["SO"] = posts.length;
      logMsg(`[SO] ${posts.length} posts scraped`);
    }

    const scrapeMs = Date.now() - startTime;
    logMsg(`[Total] ${allPosts.length} raw posts scraped in ${scrapeMs}ms`);

    if (allPosts.length === 0) {
      logMsg("[WARNING] Zero posts scraped from ALL sources!");
      return new Response(
        JSON.stringify({ success: false, message: "Zero posts scraped", log, elapsed_ms: Date.now() - startTime }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Log some samples
    for (const post of allPosts.slice(0, 3)) {
      logMsg(`[Sample] "${post.title.substring(0, 60)}" (${post.source_type}, ${post.upvotes} upvotes)`);
    }

    // ═══ DEDUP FILTER ═══
    const newPosts = await filterNewPosts(allPosts, supabase);
    logMsg(`[Dedup] ${newPosts.length} new posts (${allPosts.length - newPosts.length} already in DB)`);

    if (newPosts.length === 0) {
      logMsg("[Done] No new posts to process");
      return new Response(
        JSON.stringify({ success: true, message: "No new posts to process", log, elapsed_ms: Date.now() - startTime }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ═══ SHOWCASE PRE-FILTER ═══
    // Remove "I built X" / "Show HN" / project showcase posts BEFORE Claude scoring
    const nonShowcase = newPosts.filter((p) => !isShowcasePost(p));
    const showcaseFiltered = newPosts.length - nonShowcase.length;
    if (showcaseFiltered > 0) {
      logMsg(`[Showcase filter] Removed ${showcaseFiltered} showcase/launch posts`);
    }

    if (nonShowcase.length === 0) {
      logMsg("[Done] All new posts were showcase/launch posts — nothing to score");
      return new Response(
        JSON.stringify({ success: true, message: "All posts filtered as showcases", log, elapsed_ms: Date.now() - startTime }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Cap to stay within timeout
    const toProcess = nonShowcase.slice(0, MAX_POSTS_TO_PROCESS);
    if (nonShowcase.length > MAX_POSTS_TO_PROCESS) {
      logMsg(`[Cap] Processing ${MAX_POSTS_TO_PROCESS} of ${nonShowcase.length} new posts`);
    }

    // ═══ SCORE WITH CLAUDE ═══
    const scored = await scoreWithClaude(toProcess, OPENROUTER_API_KEY, logMsg);
    logMsg(`[Claude] ${scored.length} ideas extracted from ${toProcess.length} posts`);

    // ═══ INSERT ═══
    const { inserted, skipped, errors } = await insertIdeas(scored, supabase, logMsg);
    logMsg(`[Insert] ${inserted} inserted | ${skipped} skipped | ${errors} errors`);

    const totalMs = Date.now() - startTime;
    logMsg(`[Done] Completed in ${totalMs}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          ...sourceCounts,
          total_scraped: allPosts.length,
          new_posts: newPosts.length,
          showcase_filtered: showcaseFiltered,
          processed: toProcess.length,
          claude_extracted: scored.length,
          inserted,
          skipped,
          errors,
          elapsed_ms: totalMs,
        },
        log,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("scrape-ideas fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", elapsed_ms: Date.now() - startTime }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
