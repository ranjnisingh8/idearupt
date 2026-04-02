import { X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { useProStatus } from "@/hooks/useProStatus";
import { getPriceLabel } from "@/utils/checkout";

interface WaitlistModalProps {
  open: boolean;
  onClose: () => void;
  source?: string;
}

const features = [
  "8 idea views, 8 signals, 8 use cases/day",
  "Pain Radar — live complaint feed by niche",
  "Sniper Mode Alerts — email alerts for matching problems",
  "PDF reports & exports",
  "Original Reddit/HN source threads",
  "Unlimited Pain Radar & Sniper Alerts",
  "Compare ideas side by side",
  "Unlimited saved ideas",
];

const WaitlistModal = ({ open, onClose, source = "competitor_intel" }: WaitlistModalProps) => {
  const { user } = useAuth();
  const { isEarlyAdopter } = useProStatus();
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(147);

  useEffect(() => {
    if (open) {
      trackEvent(EVENTS.WAITLIST_MODAL_OPENED, { source });
      setEmail(user?.email || "");
      supabase.from("pro_waitlist").select("id", { count: "exact", head: true }).then(({ count }) => {
        if (count != null) setTotalCount(147 + count);
      });
      if (user) {
        supabase.from("pro_waitlist").select("id").eq("user_id", user.id).maybeSingle().then(({ data }) => {
          if (data) setSuccess(true);
        });
      }
    }
  }, [open, user]);

  // Realtime: auto-update waitlist count while modal is open
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('waitlist-modal-count')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pro_waitlist' },
        () => { setTotalCount(prev => prev + 1); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open]);

  const handleSubmit = async () => {
    if (!email) return;
    if (!user) { toast({ title: "Please sign in to join the waitlist" }); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from("pro_waitlist").insert({ user_id: user.id, email, source }).select("id").single();
      if (error) {
        if (error.code === "23505") { setSuccess(true); toast({ title: "You're already on the waitlist!" }); return; }
        throw error;
      }
      setSuccess(true);
      const { count } = await supabase.from("pro_waitlist").select("id", { count: "exact", head: true });
      setPosition(count ?? 1);
      trackEvent(EVENTS.WAITLIST_JOINED, { source, position: count });
      toast({ title: "You're in! 🎉" });
      // Fire-and-forget waitlist confirmation email
      supabase.functions.invoke("send-waitlist-email", {
        body: { email, name: user.user_metadata?.name || user.user_metadata?.full_name || "", position: count ?? 1 },
      }).catch(() => {});
    } catch {
      toast({ title: "Error joining waitlist", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Join Pro waitlist"
            className="rounded-2xl p-4 sm:p-6 w-full max-w-md"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-heading text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>🚀 Upgrade to Pro</h3>
              <button onClick={onClose} aria-label="Close waitlist modal" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {success ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg, #7C6AED, #06B6D4)' }}>
                  <Check className="w-8 h-8 text-white" strokeWidth={1.5} />
                </div>
                <h4 className="font-heading text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>You're in!</h4>
                <p className="font-body text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {position ? `You're #${position} on the list. ` : ""}We'll email you when Pro goes live.
                </p>
              </motion.div>
            ) : (
              <>
                <p className="font-body text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                  Get unlimited validations, blueprints, competitor intel, and all Pro features for <strong style={{ color: "#9585F2" }}>{priceLabel}</strong>.
                </p>
                <ul className="space-y-2.5 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 font-body text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <Check className="w-4 h-4 text-accent shrink-0" strokeWidth={1.5} /> {f}
                    </li>
                  ))}
                </ul>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="font-body w-full rounded-[8px] py-3 px-4 text-sm mb-3"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <button onClick={handleSubmit} disabled={loading || !email}
                  className="w-full btn-gradient py-3 font-heading text-sm font-semibold disabled:opacity-50">
                  {loading ? "Joining..." : "Join Waitlist"}
                </button>
                <p className="font-body text-[11px] text-center mt-3" style={{ color: 'var(--text-tertiary)' }}>
                  🔥 {totalCount} builders already on the waitlist
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WaitlistModal;