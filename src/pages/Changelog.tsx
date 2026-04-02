import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Zap, Bug, Wrench } from "lucide-react";

interface ChangelogEntry {
  date: string;
  version: string;
  items: {
    type: "feature" | "improvement" | "fix" | "internal";
    text: string;
  }[];
}

const TYPE_CONFIG = {
  feature: { icon: Sparkles, label: "New", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.25)", color: "#A78BFA" },
  improvement: { icon: Zap, label: "Improved", bg: "rgba(6,182,212,0.1)", border: "rgba(6,182,212,0.25)", color: "#22D3EE" },
  fix: { icon: Bug, label: "Fixed", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", color: "#34D399" },
  internal: { icon: Wrench, label: "Internal", bg: "rgba(142,147,168,0.1)", border: "rgba(142,147,168,0.25)", color: "#8E93A8" },
};

const changelog: ChangelogEntry[] = [
  {
    date: "February 14, 2026",
    version: "0.9.0",
    items: [
      { type: "feature", text: "Legal pages: Privacy Policy, Terms of Service, and Refund Policy" },
      { type: "feature", text: "Changelog page to track product updates" },
      { type: "improvement", text: "Upgraded 404 page with branded design and navigation" },
      { type: "improvement", text: "Global footer with links to all legal and product pages" },
      { type: "fix", text: "Limit badges now use muted purple instead of alarming red" },
    ],
  },
  {
    date: "February 13, 2026",
    version: "0.8.0",
    items: [
      { type: "feature", text: "Pipeline Health panel on admin dashboard (ideas, signals, use cases)" },
      { type: "feature", text: "Competitor intel tiering (dormant until Pro launch)" },
      { type: "improvement", text: "Updated free-tier limits: 3 validations, 2 deep dives, 3 pain signals, 3 use cases per day" },
      { type: "improvement", text: "Usage badges now show 'X/Y today' format on all AI tool buttons" },
      { type: "feature", text: "ProBadge added to Analyze Competitors button" },
    ],
  },
  {
    date: "February 10, 2026",
    version: "0.7.0",
    items: [
      { type: "feature", text: "Admin Command Center with date range picker and realtime stats" },
      { type: "feature", text: "Engagement funnel visualization" },
      { type: "feature", text: "Hourly activity chart" },
      { type: "feature", text: "User journey dialog for individual session tracking" },
      { type: "improvement", text: "Active users panel with 15s polling" },
    ],
  },
  {
    date: "February 7, 2026",
    version: "0.6.0",
    items: [
      { type: "feature", text: "Pricing page with Free/Pro comparison cards" },
      { type: "feature", text: "Pro launch countdown timer" },
      { type: "feature", text: "Waitlist flow with confetti celebration and duplicate detection" },
      { type: "feature", text: "Sitewide waitlist banner (dismissible for 24h)" },
      { type: "improvement", text: "Auth redirect flow for pricing page waitlist action" },
    ],
  },
  {
    date: "February 3, 2026",
    version: "0.5.0",
    items: [
      { type: "feature", text: "Pain Signals page with real user complaints from Reddit & HN" },
      { type: "feature", text: "Use Cases page with AI-generated product ideas" },
      { type: "feature", text: "Builder DNA Quiz for personalized idea matching" },
      { type: "improvement", text: "Personalized feed ranking based on quiz results" },
    ],
  },
  {
    date: "January 28, 2026",
    version: "0.4.0",
    items: [
      { type: "feature", text: "AI Idea Validation with detailed scoring" },
      { type: "feature", text: "Build Blueprint generation with step-by-step roadmaps" },
      { type: "feature", text: "Competitor Intelligence analysis" },
      { type: "feature", text: "Daily usage limits with tracking" },
    ],
  },
  {
    date: "January 20, 2026",
    version: "0.3.0",
    items: [
      { type: "feature", text: "Idea feed with infinite scroll and category filters" },
      { type: "feature", text: "Idea detail page with deep-dive tabs" },
      { type: "feature", text: "Save/bookmark ideas" },
      { type: "feature", text: "Leaderboard with builder scores" },
    ],
  },
  {
    date: "January 12, 2026",
    version: "0.2.0",
    items: [
      { type: "feature", text: "Automated scraping pipeline: Reddit, Hacker News, GitHub" },
      { type: "feature", text: "AI scoring and tier classification (S/A/B/C)" },
      { type: "internal", text: "Supabase edge functions for scraping and AI processing" },
      { type: "internal", text: "Cron-based daily pipeline execution" },
    ],
  },
  {
    date: "January 5, 2026",
    version: "0.1.0",
    items: [
      { type: "feature", text: "Initial launch: Landing page, auth, onboarding" },
      { type: "feature", text: "Dark-mode-first UI with Sora + Jakarta Sans typography" },
      { type: "internal", text: "Supabase setup with RLS policies" },
    ],
  },
];

const Changelog = () => {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-body mb-6 hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-tertiary)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Home
        </Link>

        <h1
          className="font-heading text-2xl sm:text-3xl font-bold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Changelog
        </h1>
        <p className="font-body text-sm mb-10" style={{ color: "var(--text-tertiary)" }}>
          What's new in Idearupt. We ship fast.
        </p>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div
            className="absolute left-[7px] top-2 bottom-2 w-px hidden sm:block"
            style={{ background: "var(--border-subtle)" }}
          />

          <div className="space-y-10">
            {changelog.map((entry) => (
              <div key={entry.version} className="relative sm:pl-8">
                {/* Dot */}
                <div
                  className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 hidden sm:block"
                  style={{
                    background: "var(--bg-base)",
                    borderColor: "var(--accent-purple)",
                  }}
                />

                {/* Date + version */}
                <div className="flex items-baseline gap-3 mb-3">
                  <span
                    className="font-heading text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {entry.date}
                  </span>
                  <span
                    className="font-body text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: "rgba(139,92,246,0.1)",
                      border: "1px solid rgba(139,92,246,0.2)",
                      color: "#A78BFA",
                    }}
                  >
                    v{entry.version}
                  </span>
                </div>

                {/* Items */}
                <ul className="space-y-2">
                  {entry.items.map((item, i) => {
                    const cfg = TYPE_CONFIG[item.type];
                    const Icon = cfg.icon;
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        <span
                          className="font-body text-[9px] font-semibold px-1.5 py-0.5 rounded mt-0.5 whitespace-nowrap flex items-center gap-1"
                          style={{
                            background: cfg.bg,
                            border: `1px solid ${cfg.border}`,
                            color: cfg.color,
                          }}
                        >
                          <Icon className="w-2.5 h-2.5" />
                          {cfg.label}
                        </span>
                        <span
                          className="font-body text-sm leading-relaxed"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {item.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default Changelog;
