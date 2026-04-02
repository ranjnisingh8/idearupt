import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, SkipForward, Zap, Clock, TrendingUp, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import AILoader from "@/components/AILoader";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { useProStatus } from "@/hooks/useProStatus";
import { openCheckout, getPlanForUser, resolveCheckoutPlan } from "@/utils/checkout";

interface StepOptionWithValue {
  label: string;
  value?: string;
  description?: string;
}

interface StepDef {
  title: string;
  subtitle: string;
  options: StepOptionWithValue[];
  multiSelect?: boolean;
  maxSelections?: number;
}

const steps: StepDef[] = [
  {
    title: "What's your tech level?",
    subtitle: "We'll match ideas to your skills",
    options: [
      { label: "No-Code", value: "no_code", description: "I use Lovable, Bubble, Softr" },
      { label: "Low-Code", value: "low_code", description: "I can tweak templates and use APIs" },
      { label: "Full-Stack", value: "full_stack", description: "I write code from scratch" },
    ],
  },
  {
    title: "Monthly budget for tools?",
    subtitle: "So we suggest ideas you can afford",
    options: [
      { label: "$0", value: "zero", description: "Free tools only" },
      { label: "$1–100/mo", value: "low" },
      { label: "$100–500/mo", value: "medium" },
      { label: "$500+/mo", value: "high" },
    ],
  },
  {
    title: "Time you can commit?",
    subtitle: "We'll match the scope accordingly",
    options: [
      { label: "Side Hustle", value: "side_hustle", description: "< 10 hrs/week" },
      { label: "Part-Time", value: "part_time", description: "10–30 hrs/week" },
      { label: "Full-Time", value: "full_time", description: "30+ hrs/week" },
    ],
  },
  {
    title: "Industries you're interested in?",
    subtitle: "Select all that apply",
    multiSelect: true,
    options: [
      { label: "SaaS / Software" }, { label: "E-commerce" }, { label: "Health & Wellness" },
      { label: "Finance & Fintech" }, { label: "Education" }, { label: "Real Estate" },
      { label: "Marketing & Sales" }, { label: "Productivity" }, { label: "AI / ML" },
      { label: "Social / Community" }, { label: "Developer Tools" }, { label: "Other" },
    ],
  },
  {
    title: "Risk tolerance?",
    subtitle: "High risk, high reward — or play it safe?",
    options: [
      { label: "Play it Safe", value: "safe", description: "Proven models, lower risk" },
      { label: "Balanced", value: "moderate", description: "Mix of safe and innovative" },
      { label: "Moonshot", value: "moonshot", description: "Innovative, higher risk & reward" },
    ],
  },
];

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<number, string[]>>({});
  const selectionsRef = useRef<Record<number, string[]>>({});
  const [complete, setComplete] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isEarlyAdopter, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const step = steps[currentStep];

  useEffect(() => {
    trackEvent(EVENTS.QUIZ_STARTED);
  }, []);

  const updateSelections = (newSelections: Record<number, string[]>) => {
    setSelections(newSelections);
    selectionsRef.current = newSelections;
  };

  const handleSelect = (label: string, value?: string) => {
    const storeValue = value || label;
    if (step.multiSelect) {
      const current = selectionsRef.current[currentStep] || [];
      let updated: string[];
      if (current.includes(storeValue)) {
        updated = current.filter((l) => l !== storeValue);
      } else if (current.length < (step.maxSelections || 99)) {
        updated = [...current, storeValue];
      } else {
        return;
      }
      updateSelections({ ...selectionsRef.current, [currentStep]: updated });
    } else {
      updateSelections({ ...selectionsRef.current, [currentStep]: [storeValue] });
    }
  };

  const saveBuilderDna = async (finalSelections: Record<number, string[]>) => {
    if (!user) {
      toast({ title: "Please log in first", variant: "destructive" });
      navigate("/auth");
      return;
    }

    const dnaPayload = {
      user_id: user.id,
      tech_level: finalSelections[0]?.[0] || null,
      budget_range: finalSelections[1]?.[0] || null,
      time_commitment: finalSelections[2]?.[0] || null,
      industries: finalSelections[3] || [],
      risk_tolerance: finalSelections[4]?.[0] || null,
    };

    let saved = false;

    // Try 1: Use SECURITY DEFINER RPC (handles builder_dna + users.onboarding_completed)
    try {
      const { data, error } = await supabase.rpc("save_builder_dna", {
        p_tech_level: dnaPayload.tech_level,
        p_budget_range: dnaPayload.budget_range,
        p_time_commitment: dnaPayload.time_commitment,
        p_industries: dnaPayload.industries,
        p_risk_tolerance: dnaPayload.risk_tolerance,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      saved = true;
    } catch {
      // RPC may not be deployed yet — fall through to direct insert
    }

    // Try 2: Direct upsert as fallback (works if GRANT on builder_dna exists)
    if (!saved) {
      try {
        const { error } = await supabase
          .from("builder_dna")
          .upsert(dnaPayload, { onConflict: "user_id" });
        if (error) throw error;
        saved = true;
        // Also try to mark onboarding complete
        await supabase.from("users").update({ onboarding_completed: true }).eq("id", user.id).then(() => {});
      } catch {
        // Direct insert also failed
      }
    }

    if (saved) {
      toast({ title: "Builder DNA saved! 🧬" });
      // Notify useBuilderMatch hook to re-fetch DNA
      window.dispatchEvent(new Event("builder_dna_saved"));
    } else {
      toast({ title: "Profile saved locally", description: "We'll sync when you reload." });
    }

    // Always set localStorage fallback regardless of DB result
    localStorage.setItem(`onboarding_done_${user.id}`, 'true');
  };

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      trackEvent(EVENTS.ONBOARDING_STEP_COMPLETED, { step: currentStep, selections: selectionsRef.current[currentStep] });
      setCurrentStep(currentStep + 1);
    } else {
      trackEvent(EVENTS.QUIZ_COMPLETED, { selections: selectionsRef.current });
      setComplete(true);
      await saveBuilderDna(selectionsRef.current);
    }
  };

  const handleSkip = () => {
    trackEvent(EVENTS.ONBOARDING_SKIPPED, { step: currentStep });
    if (user) {
      localStorage.setItem(`onboarding_done_${user.id}`, 'true');
      // Fire-and-forget — don't await, navigate immediately
      supabase.from("users").update({ onboarding_completed: true }).eq("id", user.id).then(() => {}).catch(() => {});
    }
    navigate("/feed");
  };
  const isSelected = (value: string) => (selections[currentStep] || []).includes(value);
  const hasSelection = (selections[currentStep] || []).length > 0;

  if (complete) {
    const trialBenefits = [
      { icon: Zap, text: "Pain Radar & Sniper Mode Alerts", color: "#F59E0B" },
      { icon: TrendingUp, text: "PDF exports, source threads & more", color: "#10B981" },
      { icon: Clock, text: "Compare ideas, unlimited saves & higher limits", color: "#8B5CF6" },
      { icon: Shield, text: "No charge for 7 days — cancel with one click", color: "#3B82F6" },
    ];

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="text-center max-w-md w-full">
          <AILoader />
          <h2 className="font-heading text-[28px] font-bold mb-2 tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>Your Builder DNA is ready! 🧬</h2>
          <p className="font-body text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Your feed is now personalized to your skills and interests.</p>

          {/* Social proof stat */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl p-4 mb-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="font-heading text-[13px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Why builders start their trial immediately
            </p>
            <div className="space-y-2.5 text-left">
              {trialBenefits.map((benefit, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.07 }}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${benefit.color}15` }}>
                    <benefit.icon className="w-3.5 h-3.5" style={{ color: benefit.color }} strokeWidth={2} />
                  </div>
                  <p className="font-body text-[12.5px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{benefit.text}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Two options: Start Trial or Explore Free */}
          <div className="space-y-3">
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/pricing")}
              className="w-full py-3.5 rounded-xl font-heading font-semibold text-[15px] text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #F59E0B, #F97316)",
                boxShadow: "0 4px 20px -4px rgba(245,158,11,0.4)",
              }}
            >
              ⚡ Start 7-Day Free Trial
            </motion.button>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="font-body text-[11px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Full Pro access — cancel anytime, no charge until trial ends
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              onClick={() => navigate("/feed")}
              className="w-full py-3 rounded-xl font-heading font-medium text-[14px] flex items-center justify-center gap-2 transition-all hover:bg-white/[0.06]"
              style={{
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
              }}
            >
              Explore for free first →
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-[3px]" style={{ background: 'var(--bg-elevated)' }}>
        <motion.div
          className="h-full"
          style={{ background: '#7C6AED' }}
          animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>

      {/* Skip */}
      <div className="flex justify-end px-4 pt-3">
        <button onClick={handleSkip} className="font-body text-sm flex items-center gap-1.5 transition-colors duration-150 min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg active:bg-white/5" style={{ color: 'var(--text-secondary)' }} aria-label="Skip onboarding">
          <SkipForward className="w-4 h-4" strokeWidth={1.5} /> Skip
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full max-w-[520px]"
          >
            <p className="font-body text-[12px] font-medium uppercase tracking-[0.04em] mb-2" style={{ color: 'var(--text-tertiary)' }}>Step {currentStep + 1} of {steps.length}</p>
            <h2 className="font-heading text-[22px] font-semibold mb-1 tracking-[-0.02em] cursor-default select-none" style={{ color: 'var(--text-primary)' }}>{step.title}</h2>
            <p className="font-body text-sm mb-8 cursor-default select-none" style={{ color: 'var(--text-secondary)' }}>{step.subtitle}</p>

            <div className={`grid gap-3 ${step.multiSelect ? "grid-cols-2 sm:grid-cols-3" : ""}`}>
              {step.options.map((option) => {
                const selected = isSelected(option.value || option.label);
                return (
                  <button
                    key={option.label}
                    onClick={() => handleSelect(option.label, option.value)}
                    className="text-left rounded-[10px] p-4 min-h-[52px] transition-all duration-150 hover:border-[rgba(139,92,246,0.3)]"
                    style={{
                      background: selected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                      border: `1px solid ${selected ? 'rgba(139,92,246,0.5)' : 'var(--border-subtle)'}`,
                      boxShadow: selected ? '0 0 16px -4px rgba(139,92,246,0.2)' : 'none',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {!step.multiSelect && (
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all" style={{
                          borderColor: selected ? '#8B5CF6' : 'var(--border-hover)',
                          background: selected ? '#8B5CF6' : 'transparent',
                        }}>
                          {selected && <Check className="w-3 h-3 text-white" strokeWidth={2} />}
                        </div>
                      )}
                      {step.multiSelect && (
                        <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all" style={{
                          borderColor: selected ? '#8B5CF6' : 'var(--border-hover)',
                          background: selected ? '#8B5CF6' : 'transparent',
                        }}>
                          {selected && <Check className="w-3 h-3 text-white" strokeWidth={2} />}
                        </div>
                      )}
                      <div>
                        <p className="font-heading text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{option.label}</p>
                        {option.description && <p className="font-body text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{option.description}</p>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {hasSelection && (
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={handleNext}
                whileTap={{ scale: 0.97 }}
                className="mt-6 w-full btn-gradient py-3 min-h-[44px] font-heading font-semibold text-sm"
              >
                {currentStep === steps.length - 1
                  ? "Finish"
                  : step.multiSelect
                    ? `Continue (${(selections[currentStep] || []).length} selected)`
                    : "Next"}
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;