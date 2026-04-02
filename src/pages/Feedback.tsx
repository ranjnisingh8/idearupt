import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { SUPABASE_URL } from "@/lib/supabase";

/**
 * Public feedback page — no auth required.
 * Accessed via signed email link: /feedback?type=quick|deep&uid=USER_ID&token=TOKEN
 */

interface QuickResponses {
  reason: string;
  missing_feature: string;
  nps: number;
}

interface DeepResponses {
  biggest_frustration: string;
  features_used: string[];
  pricing_feedback: string;
  ideal_tool: string;
  additional_thoughts: string;
}

const FEATURES_OPTIONS = [
  "Idea Feed",
  "Build Blueprint",
  "Competitor Analysis",
  "Deep Dive",
  "Validate My Idea",
  "Pain Radar",
  "Sniper Mode Alerts",
  "PDF Exports",
  "Leaderboard",
  "Use Cases",
];

const PRICING_OPTIONS = [
  "Too expensive",
  "Fair price, just didn't need it",
  "Would pay if features improved",
  "Prefer a cheaper tier with fewer features",
  "Would pay yearly at a discount",
];

export default function Feedback() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") as "quick" | "deep" || "quick";
  const uid = searchParams.get("uid") || "";
  const token = searchParams.get("token") || "";

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewardDays, setRewardDays] = useState(0);

  // Quick form state
  const [reason, setReason] = useState("");
  const [missingFeature, setMissingFeature] = useState("");
  const [nps, setNps] = useState(5);

  // Deep form state
  const [biggestFrustration, setBiggestFrustration] = useState("");
  const [featuresUsed, setFeaturesUsed] = useState<string[]>([]);
  const [pricingFeedback, setPricingFeedback] = useState("");
  const [idealTool, setIdealTool] = useState("");
  const [additionalThoughts, setAdditionalThoughts] = useState("");

  const totalSteps = type === "quick" ? 3 : 5;

  const canProceed = () => {
    if (type === "quick") {
      if (step === 0) return reason.trim().length > 0;
      if (step === 1) return missingFeature.trim().length > 0;
      if (step === 2) return true; // NPS always valid
    } else {
      if (step === 0) return biggestFrustration.trim().length > 0;
      if (step === 1) return featuresUsed.length > 0;
      if (step === 2) return pricingFeedback.length > 0;
      if (step === 3) return idealTool.trim().length > 0;
      if (step === 4) return true; // Additional thoughts optional
    }
    return false;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    const responses = type === "quick"
      ? { reason, missing_feature: missingFeature, nps }
      : { biggest_frustration: biggestFrustration, features_used: featuresUsed, pricing_feedback: pricingFeedback, ideal_tool: idealTool, additional_thoughts: additionalThoughts };

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/submit-feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, token, feedback_type: type, responses }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      setRewardDays(data.reward_days || (type === "deep" ? 7 : 3));
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  if (!uid || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#09090b" }}>
        <p className="text-zinc-400 text-lg">Invalid feedback link. Please use the link from your email.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#09090b" }}>
        <div className="max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-6">✨</div>
          <h1 className="text-2xl font-bold text-zinc-100 mb-3">done. your pro access is back for {rewardDays} days.</h1>
          <p className="text-zinc-400 mb-8">thanks for taking the time. this genuinely helps.</p>
          <a
            href="/feed"
            className="inline-block px-8 py-3 rounded-lg font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}
          >
            go explore →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#09090b" }}>
      <div className="max-w-lg w-full mx-4">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{
                background: i <= step ? "#8B5CF6" : "#27272a",
              }}
            />
          ))}
          <span className="text-xs text-zinc-500 ml-2">
            {step + 1} of {totalSteps}
          </span>
        </div>

        {/* Quick form */}
        {type === "quick" && (
          <>
            {step === 0 && (
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">why didn't you stick around?</h2>
                <p className="text-zinc-400 text-sm mb-6">be honest — it helps more than you think.</p>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-3 rounded-lg text-zinc-100 text-sm"
                  style={{ background: "#18181b", border: "1px solid #27272a" }}
                >
                  <option value="">select a reason...</option>
                  <option value="too_expensive">too expensive</option>
                  <option value="not_useful">ideas weren't useful for me</option>
                  <option value="confusing">confusing to use</option>
                  <option value="missing_features">missing features I need</option>
                  <option value="found_alternative">found something better</option>
                  <option value="no_time">didn't have time to explore</option>
                  <option value="just_browsing">was just browsing, not serious</option>
                  <option value="other">other</option>
                </select>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">what would make you come back?</h2>
                <p className="text-zinc-400 text-sm mb-6">one feature, one fix, anything.</p>
                <input
                  type="text"
                  value={missingFeature}
                  onChange={(e) => setMissingFeature(e.target.value)}
                  placeholder="e.g., more AI tools, cheaper pricing, better ideas..."
                  className="w-full p-3 rounded-lg text-zinc-100 text-sm placeholder-zinc-600"
                  style={{ background: "#18181b", border: "1px solid #27272a" }}
                  maxLength={500}
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">how likely are you to recommend idearupt?</h2>
                <p className="text-zinc-400 text-sm mb-6">1 = not at all, 10 = absolutely</p>
                <div className="flex gap-2 justify-center">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNps(n)}
                      className="w-10 h-10 rounded-lg text-sm font-semibold transition-colors"
                      style={{
                        background: nps === n ? "#8B5CF6" : "#18181b",
                        border: `1px solid ${nps === n ? "#8B5CF6" : "#27272a"}`,
                        color: nps === n ? "#fff" : "#a1a1aa",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Deep form */}
        {type === "deep" && (
          <>
            {step === 0 && (
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">what was your biggest frustration?</h2>
                <p className="text-zinc-400 text-sm mb-6">with idearupt, with finding ideas, anything.</p>
                <textarea
                  value={biggestFrustration}
                  onChange={(e) => setBiggestFrustration(e.target.value)}
                  placeholder="tell me what bugged you..."
                  rows={4}
                  className="w-full p-3 rounded-lg text-zinc-100 text-sm placeholder-zinc-600 resize-none"
                  style={{ background: "#18181b", border: "1px solid #27272a" }}
                  maxLength={2000}
                />
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">which features did you actually use?</h2>
                <p className="text-zinc-400 text-sm mb-6">select all that apply.</p>
                <div className="grid grid-cols-2 gap-2">
                  {FEATURES_OPTIONS.map((f) => (
                    <button
                      key={f}
                      onClick={() =>
                        setFeaturesUsed((prev) =>
                          prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
                        )
                      }
                      className="p-3 rounded-lg text-sm text-left transition-colors"
                      style={{
                        background: featuresUsed.includes(f) ? "#1e1b2e" : "#18181b",
                        border: `1px solid ${featuresUsed.includes(f) ? "#8B5CF6" : "#27272a"}`,
                        color: featuresUsed.includes(f) ? "#e0d4ff" : "#a1a1aa",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">how do you feel about the pricing?</h2>
                <p className="text-zinc-400 text-sm mb-6">be brutal — it's fine.</p>
                <div className="space-y-2">
                  {PRICING_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setPricingFeedback(opt)}
                      className="w-full p-3 rounded-lg text-sm text-left transition-colors"
                      style={{
                        background: pricingFeedback === opt ? "#1e1b2e" : "#18181b",
                        border: `1px solid ${pricingFeedback === opt ? "#8B5CF6" : "#27272a"}`,
                        color: pricingFeedback === opt ? "#e0d4ff" : "#a1a1aa",
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">describe your ideal tool for finding startup ideas</h2>
                <p className="text-zinc-400 text-sm mb-6">what would you actually pay for?</p>
                <textarea
                  value={idealTool}
                  onChange={(e) => setIdealTool(e.target.value)}
                  placeholder="what would make you go 'shut up and take my money'?"
                  rows={4}
                  className="w-full p-3 rounded-lg text-zinc-100 text-sm placeholder-zinc-600 resize-none"
                  style={{ background: "#18181b", border: "1px solid #27272a" }}
                  maxLength={2000}
                />
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">anything else?</h2>
                <p className="text-zinc-400 text-sm mb-6">totally optional. but if there's something on your mind...</p>
                <textarea
                  value={additionalThoughts}
                  onChange={(e) => setAdditionalThoughts(e.target.value)}
                  placeholder="go wild..."
                  rows={4}
                  className="w-full p-3 rounded-lg text-zinc-100 text-sm placeholder-zinc-600 resize-none"
                  style={{ background: "#18181b", border: "1px solid #27272a" }}
                  maxLength={2000}
                />
              </div>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm mt-4">{error}</p>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              ← back
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleNext}
            disabled={!canProceed() || submitting}
            className="px-6 py-3 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}
          >
            {submitting
              ? "submitting..."
              : step === totalSteps - 1
                ? `submit & get ${type === "deep" ? 7 : 3} days pro →`
                : "next →"}
          </button>
        </div>

        {/* Reward hint */}
        <p className="text-center text-xs text-zinc-600 mt-6">
          {type === "deep" ? "7" : "3"} days of pro access when you finish
        </p>
      </div>
    </div>
  );
}
