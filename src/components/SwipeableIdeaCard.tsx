import { useState, useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const SWIPE_THRESHOLD = 80;

interface SwipeableIdeaCardProps {
  children: React.ReactNode;
  ideaId: string;
  onSave?: () => void;
  onDismiss?: () => void;
}

const haptic = (ms = 10) => {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
};

const SwipeableIdeaCard = ({ children, ideaId, onSave, onDismiss }: SwipeableIdeaCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const x = useMotionValue(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const [swiped, setSwiped] = useState<"left" | "right" | null>(null);

  // Visual overlays
  const saveOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 0.9]);
  const skipOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [0.9, 0]);
  const cardRotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = true;
    isHorizontal.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Determine direction on first significant move
    if (isHorizontal.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }

    // Only track horizontal swipes
    if (!isHorizontal.current) return;
    x.set(dx);
  }, [x]);

  const handleTouchEnd = useCallback(async () => {
    if (!swiping.current || !isHorizontal.current) {
      swiping.current = false;
      isHorizontal.current = null;
      x.set(0);
      return;
    }

    swiping.current = false;
    const currentX = x.get();

    if (currentX > SWIPE_THRESHOLD) {
      // Right swipe = Save
      haptic(15);
      setSwiped("right");
      if (!user) {
        navigate("/auth");
        x.set(0);
        setSwiped(null);
        return;
      }
      try {
        await supabase.from("user_interactions").insert({ user_id: user.id, idea_id: ideaId, action: "saved" });
        toast({ title: "\u2705 Saved!" });
        onSave?.();
      } catch {
        // Silently fail — might be duplicate
      }
      // Slide off and reset
      setTimeout(() => { x.set(0); setSwiped(null); }, 400);
    } else if (currentX < -SWIPE_THRESHOLD) {
      // Left swipe = Skip
      haptic(10);
      setSwiped("left");
      onDismiss?.();
      setTimeout(() => { x.set(0); setSwiped(null); }, 400);
    } else {
      x.set(0);
    }
    isHorizontal.current = null;
  }, [x, user, ideaId, navigate, onSave, onDismiss]);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Save overlay (right swipe) */}
      <motion.div
        className="absolute inset-0 z-10 flex items-center justify-start pl-6 rounded-2xl pointer-events-none"
        style={{ background: "rgba(16,185,129,0.15)", opacity: saveOpacity }}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.3)" }}>
          <Check className="w-5 h-5 text-green-400" strokeWidth={2.5} />
        </div>
      </motion.div>

      {/* Skip overlay (left swipe) */}
      <motion.div
        className="absolute inset-0 z-10 flex items-center justify-end pr-6 rounded-2xl pointer-events-none"
        style={{ background: "rgba(239,68,68,0.12)", opacity: skipOpacity }}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.3)" }}>
          <X className="w-5 h-5 text-red-400" strokeWidth={2.5} />
        </div>
      </motion.div>

      {/* Card content */}
      <motion.div
        style={{ x, rotate: cardRotate }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        animate={swiped === "right" ? { x: 300, opacity: 0 } : swiped === "left" ? { x: -300, opacity: 0 } : {}}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative z-20 will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
};

export default SwipeableIdeaCard;
