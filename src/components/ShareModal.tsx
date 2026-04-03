import { X, Link2, Check, Download, Share } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { useGamification } from "@/hooks/useGamification";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  ideaId: string;
  ideaTitle: string;
  score: number;
  oneLiner?: string;
  painScore?: number;
  trendScore?: number;
}

const ShareModal = ({ open, onClose, ideaId, ideaTitle, score, oneLiner, painScore, trendScore }: ShareModalProps) => {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const { user } = useAuth();
  const { recordActivity } = useGamification();

  // Cleanup timers + Escape key
  useEffect(() => {
    if (!open) return;
    trackEvent(EVENTS.SHARE_MODAL_OPENED, { idea_id: ideaId });
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("keydown", handleEsc);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, [open, onClose, ideaId]);
  const shareUrl = `${window.location.origin}/idea/${ideaId}`;
  const shareText = `Just found a problem scoring ${score.toFixed(1)}/10 on Idearupt \u{1F525}\n\n${ideaTitle} — ${oneLiner || ""}\n\nPain level: ${painScore?.toFixed(1) || "?"}/10\n\n${shareUrl}`;

  const isMobile = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const trackShare = useCallback(async (platform: string) => {
    if (!user || !ideaId) return;
    try {
      await supabase.from("user_interactions").insert({ user_id: user.id, idea_id: ideaId, action: "shared" });
      recordActivity("share", 20);
    } catch {
      // silently fail tracking
    }
    toast({ title: "\u{1F389} You unlocked 5 more views!" });
  }, [user, ideaId, recordActivity]);

  // Native share for mobile — uses OS-level share sheet
  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: `${ideaTitle} — Idearupt`,
        text: `${ideaTitle} — ${oneLiner || ""}\nScored ${score.toFixed(1)}/10 on Idearupt`,
        url: shareUrl,
      });
      trackShare("native");
      onClose();
    } catch (err: unknown) {
      // User cancelled share — not an error
      if ((err as Error)?.name !== "AbortError") {
        toast({ title: "Share failed", variant: "destructive" });
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link copied!" });
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
      trackShare("copy");
    } catch {
      // Fallback for mobile browsers that don't support clipboard API
      try {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopied(true);
        toast({ title: "Link copied!" });
        copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
        trackShare("copy");
      } catch {
        toast({ title: "Failed to copy", variant: "destructive" });
      }
    }
  };

  const openTwitter = () => { trackShare("twitter"); window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer"); };
  const openLinkedIn = () => { trackShare("linkedin"); window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, "_blank", "noopener,noreferrer"); };
  const openWhatsApp = () => { trackShare("whatsapp"); window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer"); };

  const handleDownload = async () => {
    if (!shareCardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `idearupt-${ideaId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast({ title: "Image downloaded!" });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const scoreColor = score >= 9 ? "#10B981" : score >= 7 ? "#06B6D4" : score >= 5 ? "#F59E0B" : "#565B6E";

  // Build share action buttons — native share first on mobile
  const shareActions = [
    // Native share on mobile (top of list, most prominent)
    ...(canNativeShare && isMobile ? [{
      onClick: handleNativeShare,
      icon: <Share className="w-5 h-5" strokeWidth={1.5} style={{ color: '#9585F2' }} />,
      label: "Share...",
      highlight: true,
    }] : []),
    { onClick: handleCopy, icon: copied ? <Check className="w-5 h-5 text-[#34D399]" strokeWidth={1.5} /> : <Link2 className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />, label: copied ? "Copied!" : "Copy Link", highlight: false },
    { onClick: openTwitter, icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-tertiary)' }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>, label: "Share to X / Twitter", highlight: false },
    { onClick: openLinkedIn, icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0A66C2' }}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>, label: "Share to LinkedIn", highlight: false },
    { onClick: openWhatsApp, icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#25D366' }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>, label: "Share to WhatsApp", highlight: false },
    ...(!isMobile ? [{ onClick: handleDownload, icon: <Download className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />, label: downloading ? "Generating..." : "Download as Image", highlight: false }] : []),
  ];

  const modalContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pb-20 sm:pb-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: isMobile ? 100 : 8, scale: isMobile ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: isMobile ? 100 : 8, scale: isMobile ? 1 : 0.98 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Share this idea"
            className={`w-full max-w-sm p-5 ${isMobile ? "rounded-t-2xl" : "rounded-2xl mx-4"}`}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle for mobile */}
            {isMobile && (
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-hover)' }} />
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Share this idea</h3>
              <button onClick={onClose} aria-label="Close share modal" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }}>
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Share preview card */}
            <div
              ref={shareCardRef}
              className="rounded-xl p-5 mb-4 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #0C0E15 0%, #1a0e2e 50%, #0C0E15 100%)',
                border: '1px solid rgba(124,106,237,0.2)',
              }}
            >
              <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${scoreColor}33 0%, transparent 70%)` }} />

              <h4 className="font-heading text-base font-bold mb-1.5 leading-snug" style={{ color: '#F0F1F3' }}>{ideaTitle}</h4>
              {oneLiner && <p className="font-body text-xs mb-4 leading-relaxed" style={{ color: '#8B8FA3' }}>{oneLiner}</p>}

              <div className="flex items-end justify-between">
                <div className="flex gap-4">
                  {painScore != null && (
                    <div>
                      <p className="font-body text-[9px] uppercase tracking-widest mb-0.5" style={{ color: '#4E5368' }}>Pain</p>
                      <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(painScore / 10) * 100}%`, background: '#F97316' }} />
                      </div>
                    </div>
                  )}
                  {trendScore != null && (
                    <div>
                      <p className="font-body text-[9px] uppercase tracking-widest mb-0.5" style={{ color: '#4E5368' }}>Trend</p>
                      <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(trendScore / 10) * 100}%`, background: '#06B6D4' }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-heading text-[48px] font-bold leading-none tabular-nums" style={{ color: scoreColor, filter: `drop-shadow(0 0 16px ${scoreColor}66)` }}>
                    {score.toFixed(1)}
                  </span>
                  <p className="font-body text-[9px] uppercase tracking-widest" style={{ color: '#4E5368' }}>/ 10</p>
                </div>
              </div>

              <div className="mt-3 pt-2 flex items-center gap-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="font-heading text-[9px] font-medium tracking-wider" style={{ color: '#4E5368' }}>Discovered on</span>
                <span className="font-heading text-[9px] font-bold tracking-wider" style={{ color: '#9585F2' }}>IDEARUPT</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {shareActions.map(({ onClick, icon, label, highlight }) => (
                <button key={label} onClick={onClick}
                  className="w-full flex items-center gap-3 rounded-[10px] p-3.5 min-h-[48px] font-body text-sm font-medium transition-all duration-150 active:scale-[0.98]"
                  style={{
                    background: highlight ? 'linear-gradient(135deg, rgba(124,106,237,0.12), rgba(6,182,212,0.12))' : 'var(--bg-surface)',
                    border: highlight ? '1px solid rgba(124,106,237,0.3)' : '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)'
                  }}>
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Portal to document.body so it always renders above everything
  return createPortal(modalContent, document.body);
};

export default ShareModal;
