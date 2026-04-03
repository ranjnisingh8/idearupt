import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Dynamic CORS — restrict to known origins
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
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const startTime = Date.now();
  const log: string[] = [];
  const logMsg = (msg: string) => { log.push(msg); };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("ANTHROPIC KEY") || "";

    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "No OpenRouter API key found" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse optional batch_size from body
    let batchSize = 10;
    try {
      const body = await req.json();
      if (body.batch_size && typeof body.batch_size === "number") batchSize = Math.min(body.batch_size, 50);
    } catch { /* no body — use default */ }

    logMsg(`[pre-generate] Started at ${new Date().toISOString()} — batch_size: ${batchSize}`);

    // Fetch ideas needing content — best ideas first
    const { data: ideas, error: fetchErr } = await supabase
      .from("ideas")
      .select("id, title, description, one_liner, category, target_audience, tags, estimated_mrr_range, tech_level_min, problem_statement, overall_score, blueprint_markdown, competitor_analysis")
      .or("blueprint_markdown.is.null,competitor_analysis.is.null")
      .order("overall_score", { ascending: false })
      .limit(batchSize);

    if (fetchErr) {
      logMsg(`[pre-generate] Fetch error: ${fetchErr.message}`);
      return new Response(JSON.stringify({ error: fetchErr.message, log }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    if (!ideas || ideas.length === 0) {
      logMsg("[pre-generate] All ideas already have content — nothing to do");
      return new Response(JSON.stringify({ success: true, message: "All ideas have content", stats: { processed: 0 }, log }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    logMsg(`[pre-generate] Found ${ideas.length} ideas needing content`);

    let blueprintSucceeded = 0;
    let blueprintFailed = 0;
    let competitorSucceeded = 0;
    let competitorFailed = 0;
    let skipped = 0;

    for (const idea of ideas) {
      const needsBlueprint = !idea.blueprint_markdown;
      const needsCompetitors = !idea.competitor_analysis;

      logMsg(`[idea ${idea.id}] "${(idea.title || "").substring(0, 50)}" — blueprint: ${needsBlueprint ? "NEEDED" : "exists"}, competitors: ${needsCompetitors ? "NEEDED" : "exists"}`);

      // ── Generate Blueprint ──
      if (needsBlueprint) {
        try {
          const title = (idea.title || "Untitled").substring(0, 300);
          const description = (idea.description || idea.one_liner || "No description").substring(0, 3000);
          const category = idea.category || "Other";
          const audience = idea.target_audience || "";
          const tags = Array.isArray(idea.tags) ? idea.tags.join(", ") : "";
          const mrr = idea.estimated_mrr_range || "";
          const techLevel = idea.tech_level_min || "";
          const problem = idea.problem_statement || "";

          const prompt = `Create a practical 90-day build blueprint for this startup idea, personalized to this builder's profile.

## Idea
- Title: ${title}
- Description: ${description}
- Category: ${category}
${problem ? `- Problem: ${problem}` : ""}
${audience ? `- Target Audience: ${audience}` : ""}
${tags ? `- Tags: ${tags}` : ""}
${mrr ? `- Estimated MRR: ${mrr}` : ""}
${techLevel ? `- Tech Level Needed: ${techLevel}` : ""}

## Builder Profile
- Technical Skills: general
- Budget: medium
- Time Commitment: part-time

Format your response in markdown with these exact sections:

## Executive Summary
2-3 sentence overview tailored to the builder's skill level and budget.

## Recommended Tech Stack
| Tool | Cost | Purpose |
|------|------|---------|
(list 5-8 tools appropriate for the builder's skill level: general)

## Week-by-Week Build Plan
### Weeks 1-2: Foundation
- Key tasks and deliverables
### Weeks 3-4: Core Features
- Key tasks and deliverables
### Weeks 5-8: Launch Prep
- Key tasks and deliverables
### Weeks 9-12: Growth
- Key tasks and deliverables

## Key Milestones
1. Week 2: milestone
2. Week 4: milestone
3. Week 8: milestone
4. Week 12: milestone

## Estimated Monthly Costs
| Item | Cost |
|------|------|
(realistic breakdown based on medium budget)

## Biggest Risks & How to Mitigate
1. Risk and mitigation
2. Risk and mitigation
3. Risk and mitigation

Keep it practical and actionable. The builder has part-time time and a medium budget. Recommend tools and approaches matching their general skill level.`;

          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://idearupt.ai",
              "X-Title": "Idearupt",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              max_tokens: 4000,
              messages: [
                { role: "system", content: "You are a startup build advisor. Provide practical, actionable blueprints in clean markdown format." },
                { role: "user", content: prompt },
              ],
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            logMsg(`[idea ${idea.id}] Blueprint API error: ${res.status} — ${errText.substring(0, 200)}`);
            blueprintFailed++;
            // On 429/503, wait before next request
            if (res.status === 429 || res.status === 503) await sleep(3000);
          } else {
            const data = await res.json();
            const blueprintText = data.choices?.[0]?.message?.content || "";

            if (blueprintText.length > 50) {
              const { error: updateErr } = await supabase
                .from("ideas")
                .update({ blueprint_markdown: blueprintText, blueprint_generated_at: new Date().toISOString() })
                .eq("id", idea.id);

              if (updateErr) {
                logMsg(`[idea ${idea.id}] Blueprint DB update error: ${updateErr.message}`);
                blueprintFailed++;
              } else {
                logMsg(`[idea ${idea.id}] Blueprint saved (${blueprintText.length} chars)`);
                blueprintSucceeded++;
              }
            } else {
              logMsg(`[idea ${idea.id}] Blueprint response too short: ${blueprintText.length} chars`);
              blueprintFailed++;
            }
          }

          await sleep(500); // Rate limit spacing
        } catch (e) {
          logMsg(`[idea ${idea.id}] Blueprint error: ${e instanceof Error ? e.message : String(e)}`);
          blueprintFailed++;
        }
      }

      // ── Generate Competitor Analysis ──
      if (needsCompetitors) {
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://idearupt.ai",
              "X-Title": "Idearupt",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              max_tokens: 3000,
              messages: [
                { role: "system", content: "You are a competitive intelligence analyst. Respond with ONLY valid JSON. No markdown, no backticks, no explanation outside the JSON." },
                { role: "user", content: `Analyze the competitive landscape for this startup idea.

IDEA: ${(idea.title || "").substring(0, 300)}
DESCRIPTION: ${(idea.description || idea.one_liner || "No description provided").substring(0, 3000)}

Respond with ONLY this exact JSON structure:
{
  "competitors": [
    {
      "name": "Real Company Name",
      "url": "https://their-actual-website.com",
      "pricing": "$X-Y/mo (Free tier + Pro at $XX/mo)",
      "weakness": "Specific gap or weakness this idea could exploit",
      "estimated_revenue": "$XM-YM ARR",
      "rating": "X.X/5 on G2 (XXX reviews)"
    }
  ]
}

RULES:
- List 3-5 REAL competitors that actually exist
- Use ACTUAL website URLs (verify they're real companies)
- Include REAL pricing from their websites — if you're unsure, say "Custom pricing" or "Contact sales"
- Weaknesses should be specific and exploitable
- Estimated revenue should be realistic — use range if unsure
- Rating should reference G2, Capterra, or TrustRadius with approximate review count
- If there are no direct competitors, list the closest alternatives or adjacent solutions
- Never make up company names — only list companies that actually exist`
              }],
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            logMsg(`[idea ${idea.id}] Competitor API error: ${res.status} — ${errText.substring(0, 200)}`);
            competitorFailed++;
            if (res.status === 429 || res.status === 503) await sleep(3000);
          } else {
            const data = await res.json();
            const rawText = data.choices?.[0]?.message?.content || "";

            // Robust JSON extraction (same as analyze-competitors)
            let result = null;
            try { result = JSON.parse(rawText); } catch { /* continue */ }
            if (!result) {
              const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
              if (codeBlockMatch) {
                try { result = JSON.parse(codeBlockMatch[1].trim()); } catch { /* continue */ }
              }
            }
            if (!result) {
              const jsonMatch = rawText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                try { result = JSON.parse(jsonMatch[0]); } catch {
                  try {
                    // eslint-disable-next-line no-control-regex
                    const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x1F\x7F]/g, ' ');
                    result = JSON.parse(cleaned);
                  } catch { /* give up */ }
                }
              }
            }

            if (result && Array.isArray(result.competitors) && result.competitors.length > 0) {
              const { error: updateErr } = await supabase
                .from("ideas")
                .update({ competitor_analysis: result.competitors, competitor_generated_at: new Date().toISOString() })
                .eq("id", idea.id);

              if (updateErr) {
                logMsg(`[idea ${idea.id}] Competitor DB update error: ${updateErr.message}`);
                competitorFailed++;
              } else {
                logMsg(`[idea ${idea.id}] Competitors saved (${result.competitors.length} found)`);
                competitorSucceeded++;
              }
            } else {
              logMsg(`[idea ${idea.id}] Competitor parse failed — raw: ${rawText.substring(0, 200)}`);
              competitorFailed++;
            }
          }

          await sleep(500); // Rate limit spacing
        } catch (e) {
          logMsg(`[idea ${idea.id}] Competitor error: ${e instanceof Error ? e.message : String(e)}`);
          competitorFailed++;
        }
      }
    }

    const totalMs = Date.now() - startTime;
    logMsg(`[pre-generate] Done in ${totalMs}ms — blueprint: ${blueprintSucceeded} ok / ${blueprintFailed} fail — competitors: ${competitorSucceeded} ok / ${competitorFailed} fail`);

    return new Response(JSON.stringify({
      success: true,
      stats: {
        ideas_processed: ideas.length,
        blueprint_succeeded: blueprintSucceeded,
        blueprint_failed: blueprintFailed,
        competitor_succeeded: competitorSucceeded,
        competitor_failed: competitorFailed,
        elapsed_ms: totalMs,
      },
      log,
    }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    logMsg(`[pre-generate] Fatal error: ${e instanceof Error ? e.message : String(e)}`);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again.", log, elapsed_ms: Date.now() - startTime }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
