import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronAuth } from "../_shared/cron-auth.ts";

// Dynamic CORS — generate-use-cases is called by cron (service role), not browser
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
      "authorization, x-client-info, apikey, content-type",
  };
}

// ── Configuration ──────────────────────────────────────────────
const IDEAS_TO_PROCESS = 15; // How many top ideas to convert per run
const MIN_IDEA_SCORE = 5.0; // Convert ideas with decent potential
const BATCH_SIZE = 3; // Ideas per Claude call (kept small for compute limits)
const IDEAS_FETCH_MULTIPLIER = 5; // Fetch 5x limit to allow for filtering

// ── Types ──────────────────────────────────────────────────────
interface Idea {
  id: string;
  title: string;
  one_liner: string;
  description: string;
  category: string;
  overall_score: number;
  pain_score: number;
  trend_score: number;
  competition_score: number;
  revenue_potential: number;
  build_difficulty: number;
  estimated_mrr_range: string | null;
  target_audience: string | null;
  tags: string[];
  source: string | null;
  source_url: string | null;
  source_type: string | null;
}

interface GeneratedUseCase {
  idea_index: number;
  title: string;
  target_user: string;
  problem: string;
  solution: string;
  pricing_recommendation: string;
  where_to_find_customers: string;
  launch_steps: string[];
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimated_build_time: string;
  demand_score: number;
  source_links: string[];
}

// ── Helpers ────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Build prompt for Claude ────────────────────────────────────
function buildUseCasePrompt(ideas: Idea[]): string {
  const ideasText = ideas
    .map(
      (idea, i) =>
        `IDEA ${i + 1}:
Title: ${idea.title}
One-liner: ${idea.one_liner}
Description: ${idea.description}
Category: ${idea.category}
Target audience: ${idea.target_audience || "Not specified"}
Overall score: ${idea.overall_score} | Pain: ${idea.pain_score} | Trend: ${idea.trend_score}
Competition: ${idea.competition_score} | Revenue potential: ${idea.revenue_potential}
Build difficulty: ${idea.build_difficulty}
MRR range: ${idea.estimated_mrr_range || "Unknown"}
Source: ${idea.source || "Unknown"} (${idea.source_url || "no link"})
Tags: ${(idea.tags || []).join(", ")}`
    )
    .join("\n\n---\n\n");

  return `You are an experienced startup advisor who has launched multiple profitable businesses. You create BUSINESS-FOCUSED use case blueprints — not generic feature lists.

Every use case must answer: "How does this make money? Who pays? How do I get my first 10 paying customers in 30 days?"

IDEAS TO CONVERT:
${ideasText}

CRITICAL: Each use case must be a REAL BUSINESS OPPORTUNITY, not a generic tool description. Focus on:
- Revenue model clarity (who pays, how much, why they'll pay)
- Specific market gap (what's broken right now that people are paying to work around)
- First-customer playbook (not "post on social media" — give exact subreddits, communities, outreach scripts)
- Competitive moat (why can't someone clone this in a weekend?)

RULES:
- title: A product name that signals the business value, not just the feature (max 80 chars). NOT the same as the idea title.
- target_user: Be hyper-specific — job title, company size, budget range, urgency level. Someone reading this should think "that's exactly me." (2-3 sentences)
- problem: What are they doing RIGHT NOW as a workaround? How much time/money are they wasting? Why do existing solutions fail them? Be specific with numbers where possible. (3-5 sentences)
- solution: MVP-only features (max 3 core features). What makes this a BUSINESS, not a side project? How does it retain users? (3-5 sentences)
- pricing_recommendation: Exact prices with reasoning. Include: free trial strategy, pricing anchor, annual discount. Reference competitor pricing. (2-3 sentences)
- where_to_find_customers: 5+ SPECIFIC channels — exact subreddit names (r/SaaS, r/startups, etc.), specific Slack/Discord communities, LinkedIn search queries, cold outreach angles, partnership targets. NO generic advice like "use social media." (4-6 sentences)
- launch_steps: 5 steps from $0 to first paying customer. Each step: specific tool/platform, timeframe, expected outcome. Example: "Week 1: Post a Loom demo in r/SaaS and r/Entrepreneur, DM the 20 most engaged commenters with a free trial link." (1-2 sentences each)
- category: One of: AI/ML Tools, Developer Tools, Marketing, Sales, HR/Recruiting, Finance, Healthcare, Education, E-commerce, Productivity, Communication, Analytics, Security, Real Estate, Legal, Social, Content & Marketing, Local Business, Field Services, Logistics, SaaS Infrastructure
- difficulty: "beginner" (ship in 1-2 weeks with no-code/Cursor/Lovable), "intermediate" (3-5 weeks, APIs/integrations), "advanced" (6+ weeks, complex backend)
- estimated_build_time: Specific range like "1-2 weeks" or "3-4 weeks"
- demand_score: 1-10. Score based on: people actively paying for workarounds (high), people complaining but not paying (medium), theoretical need (low). Most should be 6-8.
- source_links: Original source URL if available, plus 2-3 community/resource links

Respond with ONLY this JSON:
{
  "use_cases": [
    {
      "idea_index": 1,
      "title": "ProductName — Sharp subtitle",
      "target_user": "Who exactly this is for",
      "problem": "Deep description of the pain point",
      "solution": "What to build and how it's different",
      "pricing_recommendation": "Specific pricing tiers",
      "where_to_find_customers": "Specific channels and strategies",
      "launch_steps": ["Step 1...", "Step 2...", "Step 3...", "Step 4...", "Step 5..."],
      "category": "Category name",
      "difficulty": "beginner|intermediate|advanced",
      "estimated_build_time": "X-Y weeks",
      "demand_score": 8,
      "source_links": ["https://...", "https://..."]
    }
  ]
}`;
}

// ── Generate use cases with Claude ─────────────────────────────
const claudeLog: string[] = []; // Shared log for debugging

async function generateWithClaude(
  ideas: Idea[],
  anthropicKey: string
): Promise<GeneratedUseCase[]> {
  const allUseCases: GeneratedUseCase[] = [];

  for (let i = 0; i < ideas.length; i += BATCH_SIZE) {
    const batch = ideas.slice(i, i + BATCH_SIZE);
    const prompt = buildUseCasePrompt(batch);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const geminiHeaders = {
        "Authorization": `Bearer ${anthropicKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://idearupt.ai",
        "X-Title": "Idearupt",
      };
      const geminiBody = JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 4096,
        messages: [
          { role: "system", content: "You are a serial entrepreneur who has built and sold multiple SaaS businesses. You think in revenue, retention, and distribution — not features. Create business-focused startup blueprints that a solo founder can execute in 30-90 days. Every use case must clearly answer: who pays, how much, and how to get first 10 customers. Respond with ONLY valid JSON. No markdown, no backticks." },
          { role: "user", content: prompt },
        ],
      });

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: geminiHeaders,
        body: geminiBody,
      });

      if (!res.ok) {
        const errText = await res.text();
        const errMsg = `Gemini batch ${batchNum}: HTTP ${res.status} — ${errText.substring(0, 200)}`;
        console.error(errMsg);
        claudeLog.push(errMsg);
        if (res.status === 429) {
          // Rate limited, retrying after delay
          await sleep(10000);
          // Retry once
          const retryRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: geminiHeaders,
            body: geminiBody,
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            const retryText = retryData.choices?.[0]?.message?.content || "";
            try {
              const retryParsed = JSON.parse(retryText);
              const retryUCs: GeneratedUseCase[] = retryParsed.use_cases || [];
              allUseCases.push(...retryUCs);
              claudeLog.push(`Claude batch ${batchNum} (retry): ${retryUCs.length} use cases generated`);
            } catch {
              console.error(`Claude batch ${batchNum} (retry): Failed to parse JSON`);
            }
          }
        }
        continue;
      }

      const data = await res.json();
      const rawText = data.choices?.[0]?.message?.content || "";

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        // Try to extract the JSON object
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            // JSON is truncated or malformed — try to salvage individual use cases
            // Extract complete use case objects using regex
            const ucPattern = /\{[^{}]*"idea_index"\s*:\s*\d+[^{}]*"source_links"\s*:\s*\[[^\]]*\][^{}]*\}/g;
            const matches = rawText.match(ucPattern);
            if (matches && matches.length > 0) {
              parsed = { use_cases: [] as any[] };
              for (const m of matches) {
                try {
                  (parsed.use_cases as any[]).push(JSON.parse(m));
                } catch {
                  // Skip malformed individual use cases
                }
              }
              claudeLog.push(`Claude batch ${batchNum}: Salvaged ${parsed.use_cases.length} use cases from malformed JSON`);
            } else {
              // Last resort: try to fix truncated JSON by closing brackets
              let fixedJson = jsonMatch[0];
              // Count open/close brackets
              const openBraces = (fixedJson.match(/\{/g) || []).length;
              const closeBraces = (fixedJson.match(/\}/g) || []).length;
              const openBrackets = (fixedJson.match(/\[/g) || []).length;
              const closeBrackets = (fixedJson.match(/\]/g) || []).length;
              // Remove trailing comma if present
              fixedJson = fixedJson.replace(/,\s*$/, "");
              // Close any unclosed arrays/objects
              for (let b = 0; b < openBrackets - closeBrackets; b++) fixedJson += "]";
              for (let b = 0; b < openBraces - closeBraces; b++) fixedJson += "}";
              try {
                parsed = JSON.parse(fixedJson);
                claudeLog.push(`Claude batch ${batchNum}: Fixed truncated JSON (added ${openBraces - closeBraces} braces, ${openBrackets - closeBrackets} brackets)`);
              } catch {
                const errMsg = `Claude batch ${batchNum}: Failed to parse JSON even after fix attempt. Error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
                console.error(errMsg);
                claudeLog.push(errMsg);
                continue;
              }
            }
          }
        } else {
          const errMsg = `Claude batch ${batchNum}: No JSON object found in response`;
          console.error(errMsg);
          claudeLog.push(errMsg);
          continue;
        }
      }

      const useCases: GeneratedUseCase[] = parsed.use_cases || [];
      allUseCases.push(...useCases);
      claudeLog.push(`Claude batch ${batchNum}: ${useCases.length} use cases generated`);
      if (useCases.length === 0) {
        const debugMsg = `Claude batch ${batchNum}: 0 use_cases in parsed response. stop_reason=${data.stop_reason || "unknown"}, rawText length=${rawText.length}, first 300 chars: ${rawText.substring(0, 300)}`;
        claudeLog.push(debugMsg);
      }
    } catch (e) {
      const errMsg = `Claude batch ${batchNum} error: ${e instanceof Error ? e.message : String(e)}`;
      console.error(errMsg);
      claudeLog.push(errMsg);
    }

    if (i + BATCH_SIZE < ideas.length) await sleep(1000);
  }

  return allUseCases;
}

// ── Main Handler ───────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Auth guard — only allow calls with a valid service_role JWT (from pg_cron)
    const cronAuth = verifyCronAuth(req);
    if (!cronAuth.authorized) {
      return new Response(JSON.stringify({ error: cronAuth.error || "Unauthorized" }), {
        status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("ANTHROPIC KEY") || "";
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "No OpenRouter API key found" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse optional body params
    let limit = IDEAS_TO_PROCESS;
    let minScore = MIN_IDEA_SCORE;
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === "number") limit = body.limit;
      if (body.min_score && typeof body.min_score === "number") minScore = body.min_score;
    } catch {
      // No body or invalid JSON — use defaults
    }

    const log: string[] = [];
    const logMsg = (msg: string) => {
      log.push(msg);
    };

    logMsg(`[generate-use-cases] Started at ${new Date().toISOString()}`);

    // Step 0: Clean up duplicate use cases (keep newest of each normalized title)
    const { data: allUCs } = await supabase
      .from("use_cases")
      .select("id, title, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (allUCs && allUCs.length > 0) {
      const seen = new Set<string>();
      const dupeIds: string[] = [];
      for (const uc of allUCs) {
        const norm = (uc.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(norm)) {
          dupeIds.push(uc.id);
        } else {
          seen.add(norm);
        }
      }
      if (dupeIds.length > 0) {
        await supabase.from("use_cases").delete().in("id", dupeIds);
        logMsg(`[Dedup] Removed ${dupeIds.length} duplicate use cases`);
      }
    }

    // Step 1: Get existing use cases for dedup (titles only — used at insert time)
    const { data: existingUseCases } = await supabase
      .from("use_cases")
      .select("source_links, title")
      .eq("status", "active");

    // Build dedup sets: normalized use case titles (for insert-time dedup)
    const existingNormTitles = new Set(
      (existingUseCases || []).map((uc: { title: string }) =>
        uc.title.toLowerCase().replace(/[^a-z0-9]/g, "")
      )
    );

    // Collect ALL source URLs from existing use cases — these represent ideas already converted
    const existingSourceUrls = new Set<string>();
    for (const uc of existingUseCases || []) {
      const links = uc.source_links;
      if (Array.isArray(links)) {
        links.forEach((l: string) => existingSourceUrls.add(l));
      } else if (links && typeof links === "object") {
        // Handle jsonb array format
        Object.values(links).forEach((l) => {
          if (typeof l === "string") existingSourceUrls.add(l);
        });
      }
    }

    logMsg(`[Existing] ${existingUseCases?.length || 0} use cases, ${existingSourceUrls.size} source URLs tracked`);

    // Step 2: Fetch ideas that haven't been converted yet
    // Strategy: Fetch a large pool, filter by source_url (NOT by title — use case titles ≠ idea titles)
    // Use randomized ordering to avoid always processing the same top ideas
    const fetchLimit = limit * IDEAS_FETCH_MULTIPLIER;
    const { data: ideas, error: ideasError } = await supabase
      .from("ideas")
      .select("*")
      .gte("overall_score", minScore)
      .order("overall_score", { ascending: false })
      .limit(fetchLimit);

    if (ideasError) {
      logMsg(`[Error] Failed to fetch ideas: ${ideasError.message}`);
      return new Response(
        JSON.stringify({ error: ideasError.message, log }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!ideas || ideas.length === 0) {
      logMsg(`[Done] No ideas with score >= ${minScore} found`);
      return new Response(
        JSON.stringify({ success: true, message: "No qualifying ideas found", log }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Filter out ideas whose source_url already appears in existing use cases
    // This is the ONLY dedup filter on ideas — we do NOT compare idea titles to use case titles
    // because use case titles are different product names by design
    const newIdeas = (ideas as Idea[]).filter((idea) => {
      if (idea.source_url && existingSourceUrls.has(idea.source_url)) return false;
      return true;
    });

    // If we've already converted all top ideas, try fetching with offset to get the next batch
    let toProcess = newIdeas.slice(0, limit);

    if (toProcess.length < limit && ideas.length === fetchLimit) {
      // All top ideas already converted — fetch more with offset
      logMsg(`[Pagination] Only ${toProcess.length} new from top ${fetchLimit}, fetching next batch...`);
      const { data: moreIdeas } = await supabase
        .from("ideas")
        .select("*")
        .gte("overall_score", minScore)
        .order("overall_score", { ascending: false })
        .range(fetchLimit, fetchLimit + fetchLimit);

      if (moreIdeas && moreIdeas.length > 0) {
        const moreNew = (moreIdeas as Idea[]).filter((idea) => {
          if (idea.source_url && existingSourceUrls.has(idea.source_url)) return false;
          return true;
        });
        toProcess = [...toProcess, ...moreNew].slice(0, limit);
        logMsg(`[Pagination] Found ${moreNew.length} additional new ideas from offset batch`);
      }
    }

    logMsg(`[Ideas] ${ideas.length} fetched >= ${minScore} | ${newIdeas.length} unconverted | Processing ${toProcess.length}`);

    if (toProcess.length === 0) {
      logMsg(`[Done] All qualifying ideas already have use cases`);
      return new Response(
        JSON.stringify({ success: true, message: "All ideas already converted", log }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Step 3: Generate use cases with Claude
    claudeLog.length = 0; // Reset shared log
    const generatedUseCases = await generateWithClaude(toProcess, OPENROUTER_API_KEY);
    logMsg(`[Claude] ${generatedUseCases.length} use cases generated from ${toProcess.length} ideas`);
    if (claudeLog.length > 0) {
      for (const cl of claudeLog) logMsg(`[Claude-Debug] ${cl}`);
    }

    // Step 4: Insert into use_cases table (with per-item dedup)
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    const insertedNormTitles = new Set<string>(); // Track this batch to prevent intra-batch dupes

    for (const uc of generatedUseCases) {
      const ideaIndex = uc.idea_index - 1; // 0-based
      const sourceIdea = ideaIndex >= 0 && ideaIndex < toProcess.length ? toProcess[ideaIndex] : null;

      // Build source_links: include the original idea's source_url + any generated links
      const sourceLinks: string[] = [];
      if (sourceIdea?.source_url) sourceLinks.push(sourceIdea.source_url);
      if (uc.source_links) {
        for (const link of uc.source_links) {
          if (!sourceLinks.includes(link)) sourceLinks.push(link);
        }
      }

      const row = {
        title: (uc.title || "").substring(0, 200).trim(),
        target_user: uc.target_user || null,
        problem: uc.problem || null,
        solution: uc.solution || null,
        pricing_recommendation: uc.pricing_recommendation || null,
        where_to_find_customers: uc.where_to_find_customers || null,
        launch_steps: Array.isArray(uc.launch_steps) ? uc.launch_steps : null,
        category: uc.category || sourceIdea?.category || "Other",
        difficulty: ["beginner", "intermediate", "advanced"].includes(uc.difficulty)
          ? uc.difficulty
          : "intermediate",
        estimated_build_time: uc.estimated_build_time || null,
        demand_score: Math.min(10, Math.max(1, uc.demand_score || 5)),
        source_links: sourceLinks.length > 0 ? sourceLinks : null,
        status: "active" as const,
      };

      if (!row.title || row.title.length < 3) {
        logMsg(`Skipping use case: title too short`);
        skipped++;
        continue;
      }

      // Dedup: skip if normalized title already exists in DB or this batch
      const normTitle = row.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (existingNormTitles.has(normTitle) || insertedNormTitles.has(normTitle)) {
        logMsg(`Skipping duplicate: "${row.title.substring(0, 40)}"`);
        skipped++;
        continue;
      }

      const { error } = await supabase.from("use_cases").insert(row);

      if (error) {
        console.error(`Insert error for "${row.title.substring(0, 40)}":`, error.message);
        errors++;
      } else {
        logMsg(`Inserted use case: "${row.title.substring(0, 60)}" (demand: ${row.demand_score})`);
        insertedNormTitles.add(normTitle);
        existingNormTitles.add(normTitle);
        inserted++;
      }
    }

    logMsg(`[Insert] ${inserted} inserted | ${skipped} skipped | ${errors} errors`);
    logMsg(`[generate-use-cases] Completed at ${new Date().toISOString()}`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          ideas_fetched: ideas.length,
          ideas_new: newIdeas.length,
          ideas_processed: toProcess.length,
          use_cases_generated: generatedUseCases.length,
          inserted,
          skipped,
          errors,
        },
        log,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-use-cases fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
