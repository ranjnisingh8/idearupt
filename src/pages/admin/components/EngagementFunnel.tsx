import { TrendingUp, MousePointerClick, Zap, ArrowRight } from "lucide-react";
import ExportButton from "./ExportButton";
import type { EngagementFunnel as FunnelType } from "../types";

interface EngagementFunnelProps {
  funnel: FunnelType;
}

const EngagementFunnel = ({ funnel }: EngagementFunnelProps) => {
  const funnelSteps = [
    { label: "Landing Visitors", value: funnel.landing_visitors, color: "#8E93A8" },
    { label: "Signups", value: funnel.signups, color: "#10B981" },
    { label: "Onboarded", value: funnel.onboarding_completed, color: "#A855F7" },
    { label: "First Action", value: funnel.first_actions, color: "#06B6D4" },
  ];

  const ctaClicks = [
    { label: "Hero", value: funnel.cta_hero_clicks, color: "#F59E0B" },
    { label: "Explore", value: funnel.cta_explore_clicks, color: "#06B6D4" },
    { label: "Validate", value: funnel.cta_validate_clicks, color: "#A855F7" },
    { label: "Get Started", value: funnel.cta_get_started_clicks, color: "#10B981" },
    { label: "Claim Pro", value: funnel.cta_claim_pro_clicks, color: "#8B5CF6" },
  ];

  const waitlistSources = [
    { label: "Pricing Page", value: funnel.waitlist_from_pricing },
    { label: "Limit Modal", value: funnel.waitlist_from_limit },
    { label: "Banner", value: funnel.waitlist_from_banner },
  ];

  const exportData = [
    ...funnelSteps.map((s) => ({ section: "Funnel", label: s.label, value: s.value })),
    ...ctaClicks.map((c) => ({ section: "CTA Clicks", label: c.label, value: c.value })),
    ...waitlistSources.map((w) => ({ section: "Waitlist Sources", label: w.label, value: w.value })),
  ];

  return (
    <div className="surface-card p-3.5 sm:p-4 mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <TrendingUp className="w-4 h-4" style={{ color: "#10B981" }} />
          Engagement Funnel
        </h2>
        <ExportButton data={exportData} filename="engagement-funnel" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {funnelSteps.map((step, i) => (
          <div key={i} className="text-center">
            <div className="font-heading text-lg sm:text-xl font-bold" style={{ color: step.color }}>
              {step.value}
            </div>
            <div className="font-body text-[10px] sm:text-xs" style={{ color: "var(--text-tertiary)" }}>
              {step.label}
            </div>
            {i < 3 && (
              <div className="hidden sm:flex justify-center mt-1">
                <ArrowRight className="w-3 h-3" style={{ color: "var(--text-tertiary)" }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3
          className="font-body text-[10px] uppercase tracking-wider mb-2"
          style={{ color: "var(--text-tertiary)" }}
        >
          CTA Clicks
        </h3>
        <div className="flex flex-wrap gap-2">
          {ctaClicks.map((cta, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: `${cta.color}15`, border: `1px solid ${cta.color}30` }}
            >
              <MousePointerClick className="w-3 h-3" style={{ color: cta.color }} />
              <span
                className="font-body text-[10px] sm:text-[11px] font-medium"
                style={{ color: cta.color }}
              >
                {cta.label}: {cta.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-3 mt-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3
          className="font-body text-[10px] uppercase tracking-wider mb-2"
          style={{ color: "var(--text-tertiary)" }}
        >
          Waitlist Sources
        </h3>
        <div className="flex flex-wrap gap-2">
          {waitlistSources.map((src, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
            >
              <Zap className="w-3 h-3" style={{ color: "#EF4444" }} />
              <span
                className="font-body text-[10px] sm:text-[11px] font-medium"
                style={{ color: "#EF4444" }}
              >
                {src.label}: {src.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EngagementFunnel;
