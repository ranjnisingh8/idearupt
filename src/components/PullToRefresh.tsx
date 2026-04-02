import { useState, useRef, useCallback, ReactNode } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const THRESHOLD = 80;

const PullToRefresh = ({ onRefresh, children }: PullToRefreshProps) => {
  const [refreshing, setRefreshing] = useState(false);
  const pullY = useMotionValue(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const indicatorOpacity = useTransform(pullY, [0, 40, THRESHOLD], [0, 0.5, 1]);
  const indicatorScale = useTransform(pullY, [0, THRESHOLD], [0.5, 1]);
  const indicatorRotate = useTransform(pullY, [0, THRESHOLD * 2], [0, 360]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    // Only allow pull when scrolled to top
    const scrollTop = containerRef.current?.closest("[data-scroll-container]")?.scrollTop
      ?? document.documentElement.scrollTop
      ?? window.scrollY;
    if (scrollTop > 5) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const delta = Math.max(0, e.touches[0].clientY - startY.current);
    // Dampen the pull distance
    const dampened = Math.min(delta * 0.5, THRESHOLD * 1.5);
    pullY.set(dampened);
  }, [refreshing, pullY]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullY.get() >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      pullY.set(THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        pullY.set(0);
      }
    } else {
      pullY.set(0);
    }
  }, [onRefresh, pullY, refreshing]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <motion.div
        className="flex items-center justify-center overflow-hidden"
        style={{ height: pullY, opacity: indicatorOpacity }}
      >
        <motion.div
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{
            scale: indicatorScale,
            rotate: refreshing ? undefined : indicatorRotate,
            background: "rgba(139, 92, 246, 0.12)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
          }}
          animate={refreshing ? { rotate: 360 } : {}}
          transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : {}}
        >
          <RefreshCw
            className="w-4 h-4"
            style={{ color: "#A78BFA" }}
            strokeWidth={2}
          />
        </motion.div>
      </motion.div>

      <div ref={containerRef}>{children}</div>
    </div>
  );
};

export default PullToRefresh;
