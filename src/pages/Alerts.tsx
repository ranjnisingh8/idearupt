import { useState, useEffect } from "react";
import { Bell, Plus, Lock, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useAccess } from "@/hooks/useAccess";
import { useProStatus } from "@/hooks/useProStatus";
import { useNavigate } from "react-router-dom";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import AlertCard, { AlertData } from "@/components/alerts/AlertCard";
import AlertEditor from "@/components/alerts/AlertEditor";
import { toast } from "sonner";

const MAX_ALERTS = 5;

const Alerts = () => {
  const { user } = useAuth();
  const { hasFullAccess } = useAccess();
  const { isEarlyAdopter, hasUsedTrial } = useProStatus();
  const navigate = useNavigate();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);

  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AlertData | null | "new">(null);

  // Fetch alerts
  useEffect(() => {
    if (!user) return;
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from("user_alerts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setAlerts(data as AlertData[]);
      }
      setLoading(false);
    };
    fetchAlerts();
  }, [user]);

  const handleCreate = async (data: { name: string; niches: string[]; min_pain_score: number; frequency: "daily" | "weekly" }) => {
    if (!user) return;
    const { data: inserted, error } = await supabase
      .from("user_alerts")
      .insert({
        user_id: user.id,
        name: data.name,
        niches: data.niches,
        min_pain_score: data.min_pain_score,
        frequency: data.frequency,
        status: "active",
        matches_count: 0,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to create alert.");
      return;
    }
    setAlerts((prev) => [inserted as AlertData, ...prev]);
    setEditing(null);
    toast.success("Alert created!");
  };

  const handleUpdate = async (data: { name: string; niches: string[]; min_pain_score: number; frequency: "daily" | "weekly" }) => {
    if (!editing || editing === "new") return;
    const { error } = await supabase
      .from("user_alerts")
      .update({
        name: data.name,
        niches: data.niches,
        min_pain_score: data.min_pain_score,
        frequency: data.frequency,
      })
      .eq("id", editing.id);

    if (error) {
      toast.error("Failed to update alert.");
      return;
    }
    setAlerts((prev) =>
      prev.map((a) => (a.id === editing.id ? { ...a, ...data } : a))
    );
    setEditing(null);
    toast.success("Alert updated!");
  };

  const handleToggle = async (alert: AlertData) => {
    const newStatus = alert.status === "active" ? "paused" : "active";
    const { error } = await supabase
      .from("user_alerts")
      .update({ status: newStatus })
      .eq("id", alert.id);

    if (!error) {
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, status: newStatus } : a)));
      toast(newStatus === "active" ? "Alert resumed" : "Alert paused");
    }
  };

  const handleDelete = async (alert: AlertData) => {
    const { error } = await supabase.from("user_alerts").delete().eq("id", alert.id);
    if (!error) {
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      toast("Alert deleted");
    }
  };

  const handleUpgrade = () => {
    if (!user) {
      navigate("/auth?redirect=alerts");
    } else {
      openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id);
    }
  };

  // Free users: locked state
  if (!hasFullAccess) {
    return (
      <div className="min-h-screen pb-20 md:pb-0">
        <div className="mx-auto px-4 py-4 sm:py-6 max-w-3xl w-full">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-[-0.02em] mb-1">
              <span style={{ color: "var(--text-primary)" }}>Idea </span>
              <span className="text-gradient-purple-cyan">Alerts</span>
            </h1>
            <p className="font-body text-sm mb-6" style={{ color: "var(--text-tertiary)" }}>
              Get notified when problems match your criteria
            </p>

            {/* Example alert preview */}
            <div className="surface-card p-5 mb-4 opacity-60">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(124,106,237,0.1)" }}>
                  <Bell className="w-4 h-4" style={{ color: "#9585F2" }} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>AI SaaS Problems</h3>
                  <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>Daily · Pain ≥ 7</p>
                </div>
              </div>
              <div className="flex gap-1.5 mb-3">
                {["AI / ML", "SaaS", "Developer Tools"].map((n) => (
                  <span key={n} className="font-body text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(124,106,237,0.08)", border: "1px solid rgba(124,106,237,0.15)", color: "#9585F2" }}>
                    {n}
                  </span>
                ))}
              </div>
              <p className="font-body text-[11px]" style={{ color: "var(--text-tertiary)" }}>12 matches · Last: Feb 23</p>
            </div>

            {/* Upgrade CTA */}
            <div className="surface-card p-8 text-center relative overflow-hidden">
              {/* Subtle ambient glow behind lock icon */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[100px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(124,106,237,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }} />
              <div className="relative z-10">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(124,106,237,0.08)', border: '1px solid rgba(124,106,237,0.12)' }}>
                  <Lock className="w-6 h-6" style={{ color: "#9585F2" }} strokeWidth={1.5} />
                </div>
                <h2 className="font-heading text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                  Unlock Idea Alerts
                </h2>
                <p className="font-body text-sm mb-6 max-w-sm mx-auto leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Create up to 5 custom alerts. Get email notifications when new problems match your niches and pain threshold.
                </p>
                <button
                  onClick={handleUpgrade}
                  className="btn-gradient inline-flex items-center gap-2 px-7 py-3.5 text-sm"
                >
                  <Sparkles className="w-4 h-4" strokeWidth={2} />
                  Upgrade to Pro — {priceLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <div className="mx-auto px-4 py-4 sm:py-6 max-w-3xl w-full">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-[-0.02em] mb-1">
                <span style={{ color: "var(--text-primary)" }}>Idea </span>
                <span className="text-gradient-purple-cyan">Alerts</span>
              </h1>
              <p className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
                {alerts.length}/{MAX_ALERTS} alerts
              </p>
            </div>
            {alerts.length < MAX_ALERTS && !editing && (
              <button
                onClick={() => setEditing("new")}
                className="btn-gradient inline-flex items-center gap-1.5 px-5 py-2.5 text-sm"
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                New Alert
              </button>
            )}
          </div>

          {/* Editor */}
          <AnimatePresence>
            {editing && (
              <div className="mb-4">
                <AlertEditor
                  alert={editing === "new" ? null : editing}
                  onSave={editing === "new" ? handleCreate : handleUpdate}
                  onCancel={() => setEditing(null)}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Alert list */}
          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="surface-card p-4 animate-pulse">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg" style={{ background: "var(--bg-elevated)" }} />
                    <div className="flex-1">
                      <div className="h-4 rounded w-1/3 mb-1" style={{ background: "var(--bg-elevated)" }} />
                      <div className="h-3 rounded w-1/4" style={{ background: "var(--bg-elevated)" }} />
                    </div>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <div className="h-5 rounded w-16" style={{ background: "var(--bg-elevated)" }} />
                    <div className="h-5 rounded w-12" style={{ background: "var(--bg-elevated)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : alerts.length === 0 && !editing ? (
            <div className="text-center py-16 surface-card">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(124,106,237,0.08)', border: '1px solid rgba(124,106,237,0.12)' }}>
                <Bell className="w-6 h-6" style={{ color: "#9585F2" }} strokeWidth={1.5} />
              </div>
              <p className="font-heading text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                No alerts yet
              </p>
              <p className="font-body text-sm mb-5 max-w-xs mx-auto" style={{ color: "var(--text-secondary)" }}>
                Create your first alert to get notified when new problems match your criteria.
              </p>
              <button
                onClick={() => setEditing("new")}
                className="btn-gradient inline-flex items-center gap-1.5 px-6 py-3 text-sm"
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                Create Alert
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, i) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  index={i}
                  onEdit={() => setEditing(alert)}
                  onToggle={() => handleToggle(alert)}
                  onDelete={() => handleDelete(alert)}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Alerts;
