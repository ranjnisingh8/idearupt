import { useState, useEffect } from "react";
import { Bell, ChevronDown, ChevronUp, Save, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const CATEGORIES = ["AI/ML", "SaaS", "Developer Tools", "Marketing", "Sales", "E-commerce", "Analytics", "Platform", "Marketplace", "Mobile App"];
const TECH_LEVELS = ["no_code", "low_code", "full_stack"];
const BUDGET_RANGES = ["zero", "low", "medium", "high"];
const SCORE_OPTIONS = [7, 8, 9];

const formatLabel = (val: string) => val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface AlertPrefs {
  categories: string[];
  min_score: number;
  tech_levels: string[];
  budget_ranges: string[];
  keywords: string[];
  is_active: boolean;
}

const defaultPrefs: AlertPrefs = {
  categories: [],
  min_score: 7,
  tech_levels: [],
  budget_ranges: [],
  keywords: [],
  is_active: true,
};

const IdeaAlerts = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<AlertPrefs>(defaultPrefs);
  const [alertId, setAlertId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ categories: true, score: false, tech: false, budget: false, keywords: false });

  useEffect(() => {
    if (!user) return;
    supabase.from("user_alerts").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAlertId(data.id);
          setPrefs({
            categories: data.categories || [],
            min_score: data.min_score ?? 7,
            tech_levels: data.tech_levels || [],
            budget_ranges: data.budget_ranges || [],
            keywords: data.keywords || [],
            is_active: data.is_active ?? true,
          });
        }
      });
  }, [user]);

  const toggleArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    const newKws = kw.split(",").map((k) => k.trim()).filter(Boolean);
    setPrefs((p) => ({ ...p, keywords: [...new Set([...p.keywords, ...newKws])] }));
    setKeywordInput("");
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        categories: prefs.categories,
        min_score: prefs.min_score,
        tech_levels: prefs.tech_levels,
        budget_ranges: prefs.budget_ranges,
        keywords: prefs.keywords,
        is_active: prefs.is_active,
        updated_at: new Date().toISOString(),
      };

      if (alertId) {
        const { error } = await supabase.from("user_alerts").update(payload).eq("id", alertId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("user_alerts").insert(payload).select("id").single();
        if (error) throw error;
        setAlertId(data.id);
      }
      toast({ title: "✅ Alerts saved! You'll receive email notifications when matching ideas are discovered." });
    } catch {
      toast({ title: "Error saving alerts", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const CollapsibleSection = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="surface-card rounded-xl overflow-hidden" style={{ transform: "none" }}>
      <button onClick={() => toggle(id)} className="w-full flex items-center justify-between p-4">
        <span className="font-heading text-sm font-medium" style={{ color: "var(--text-primary)" }}>{title}</span>
        {expanded[id] ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />}
      </button>
      <AnimatePresence>
        {expanded[id] && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const Pill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button onClick={onClick}
      className={`font-body text-[12px] px-3 py-1.5 rounded-lg border transition-all duration-150 ${
        active ? "text-[#22D3EE] border-[rgba(6,182,212,0.3)] bg-[rgba(6,182,212,0.1)]" : "border-[var(--border-subtle)]"
      }`}
      style={!active ? { color: "var(--text-tertiary)" } : {}}>
      {label}
    </button>
  );

  // Preview summary
  const previewParts: string[] = [];
  if (prefs.categories.length > 0) previewParts.push(prefs.categories.join(", "));
  previewParts.push(`Score ${prefs.min_score}+`);
  if (prefs.tech_levels.length > 0) previewParts.push(prefs.tech_levels.map(formatLabel).join(", "));
  if (prefs.keywords.length > 0) previewParts.push(`Keywords: ${prefs.keywords.join(", ")}`);

  return (
    <section className="mb-6 pb-6" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>🔔 Idea Alerts</h2>
        <button
          onClick={() => setPrefs((p) => ({ ...p, is_active: !p.is_active }))}
          className="w-10 h-5 rounded-full relative transition-all duration-200"
          style={{ background: prefs.is_active ? "#8B5CF6" : "rgba(255,255,255,0.1)" }}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 ${prefs.is_active ? "right-0.5" : "left-0.5"}`} />
        </button>
      </div>

      <div className="space-y-2">
        <CollapsibleSection id="categories" title="📂 Categories">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Pill key={c} label={c} active={prefs.categories.includes(c)} onClick={() => setPrefs((p) => ({ ...p, categories: toggleArray(p.categories, c) }))} />
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="score" title="⭐ Minimum Score">
          <div className="flex gap-3">
            {SCORE_OPTIONS.map((s) => (
              <Pill key={s} label={`${s}+`} active={prefs.min_score === s} onClick={() => setPrefs((p) => ({ ...p, min_score: s }))} />
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="tech" title="🛠️ Tech Level">
          <div className="flex flex-wrap gap-2">
            {TECH_LEVELS.map((t) => (
              <Pill key={t} label={formatLabel(t)} active={prefs.tech_levels.includes(t)} onClick={() => setPrefs((p) => ({ ...p, tech_levels: toggleArray(p.tech_levels, t) }))} />
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="budget" title="💰 Budget Range">
          <div className="flex flex-wrap gap-2">
            {BUDGET_RANGES.map((b) => (
              <Pill key={b} label={formatLabel(b)} active={prefs.budget_ranges.includes(b)} onClick={() => setPrefs((p) => ({ ...p, budget_ranges: toggleArray(p.budget_ranges, b) }))} />
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="keywords" title="🔑 Keyword Alerts">
          <div className="flex gap-2 mb-2">
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKeyword()}
              placeholder="CRM, invoicing, HVAC..."
              className="flex-1 font-body text-sm rounded-lg px-3 py-2"
              style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
            />
            <button onClick={addKeyword} className="btn-gradient px-3 py-2 text-xs font-semibold">Add</button>
          </div>
          {prefs.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {prefs.keywords.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 font-body text-[11px] px-2 py-1 rounded-md" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#A78BFA" }}>
                  {kw}
                  <button onClick={() => setPrefs((p) => ({ ...p, keywords: p.keywords.filter((k) => k !== kw) }))}>
                    <X className="w-3 h-3" strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>

      {/* Preview */}
      <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.15)" }}>
        <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          You'll be notified when new ideas match: <span style={{ color: "#A78BFA" }}>{previewParts.join(" + ")}</span>
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-3 w-full flex items-center justify-center gap-2 btn-gradient py-2.5 font-heading text-sm font-semibold disabled:opacity-50"
      >
        <Save className="w-4 h-4" strokeWidth={1.5} />
        {saving ? "Saving..." : "Save Alert Preferences"}
      </button>
    </section>
  );
};

export default IdeaAlerts;
