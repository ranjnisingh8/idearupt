import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home, Bookmark, Sparkles, Target, MoreHorizontal,
  Radio, Briefcase, Bell, Trophy, Gift, Settings, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

const ALWAYS_HIDDEN_ROUTES = ["/auth", "/onboarding", "/quiz", "/admin"];

const haptic = (ms = 10) => {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
};

interface NavItem {
  to: string;
  icon: React.ComponentType<any>;
  label: string;
  pulse?: boolean;
  accent?: boolean;
  proBadge?: boolean;
  badge?: boolean;
  liveDot?: boolean;
}

const MobileNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const path = location.pathname;
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Notification badges
  const [feedBadge, setFeedBadge] = useState(false);

  useEffect(() => {
    const lastFeedVisit = localStorage.getItem("last_feed_visit");
    const now = Date.now();
    if (!lastFeedVisit || now - Number(lastFeedVisit) > 1800000) setFeedBadge(true);
  }, []);

  // Clear badge on route change
  useEffect(() => {
    if (path === "/feed" || path === "/") {
      setFeedBadge(false);
      localStorage.setItem("last_feed_visit", String(Date.now()));
    }
  }, [path]);

  // Close "More" sheet on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [path]);

  // Close on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (moreOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [moreOpen]);

  // Always hide on auth/onboarding routes
  if (ALWAYS_HIDDEN_ROUTES.includes(path)) return null;
  // Hide on landing page only if user is NOT logged in
  if (path === "/" && !user) return null;

  // Primary 7 tabs — Pro features front and center
  const primaryItems: NavItem[] = [
    { to: "/feed", icon: Home, label: "Feed", badge: feedBadge },
    { to: "/alerts", icon: Bell, label: "Alerts", proBadge: true },
    { to: "/radar", icon: Target, label: "Radar", proBadge: true, liveDot: true },
    { to: "/validate", icon: Sparkles, label: "Validate", proBadge: true },
    { to: "/use-cases", icon: Briefcase, label: "Cases", proBadge: true },
    { to: "/signals", icon: Radio, label: "Signals", proBadge: true },
    { to: "/saved", icon: Bookmark, label: "Saved" },
  ];

  // "More" sheet items — secondary features
  const moreItems: NavItem[] = [
    { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
    { to: "/referrals", icon: Gift, label: "Referrals" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  const isMoreActive = moreItems.some((item) => path === item.to || (item.to !== "/feed" && path.startsWith(item.to)));

  return (
    <>
      {/* Bottom Nav Bar — Futuristic glass morphism */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'rgba(6, 7, 11, 0.92)',
          backdropFilter: 'blur(32px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.5), 0 -1px 0 rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
        {/* Top gradient accent line — animated shimmer */}
        <div className="absolute top-0 left-0 right-0 h-[1px] overflow-hidden">
          <div
            className="h-full w-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(124,106,237,0.3) 20%, rgba(6,182,212,0.25) 40%, rgba(139,92,246,0.3) 60%, rgba(6,182,212,0.2) 80%, transparent 100%)',
            }}
          />
        </div>

        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: 'repeat(8, 1fr)',
            height: 'calc(58px + env(safe-area-inset-bottom, 8px))',
            paddingBottom: 'env(safe-area-inset-bottom, 8px)',
          }}
        >
          {primaryItems.map((item) => {
            const isActive = path === item.to || (item.to !== "/feed" && path.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => haptic()}
                className="flex flex-col items-center justify-center gap-[2px] py-1.5 relative haptic-press"
              >
                <div className="relative">
                  <motion.div
                    whileTap={{ scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 600, damping: 25 }}
                    className={`p-1.5 rounded-xl transition-all duration-300 ${
                      isActive
                        ? "bg-gradient-to-br from-[rgba(124,106,237,0.2)] to-[rgba(6,182,212,0.08)]"
                        : ""
                    }`}
                    style={isActive ? {
                      boxShadow: '0 0 16px rgba(124,106,237,0.2), 0 0 4px rgba(124,106,237,0.1)',
                    } : undefined}
                  >
                    <Icon
                      className={`w-[18px] h-[18px] transition-all duration-300 ${
                        isActive
                          ? "text-[#A78BFA] drop-shadow-[0_0_6px_rgba(167,139,250,0.4)]"
                          : "text-[var(--text-tertiary)]"
                      }`}
                      strokeWidth={isActive ? 2.2 : 1.5}
                    />
                  </motion.div>

                  {/* Notification badge (red dot) */}
                  {item.badge && !isActive && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                  )}

                  {/* Live dot for Pain Radar */}
                  {item.liveDot && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_4px_rgba(74,222,128,0.6)]" />
                    </span>
                  )}
                </div>

                {/* Label + PRO badge */}
                <div className="flex flex-col items-center gap-0">
                  <span className={`font-body text-[9px] leading-tight transition-all duration-300 ${
                    isActive
                      ? "text-[#A78BFA] font-semibold"
                      : "text-[var(--text-tertiary)]"
                  }`}>
                    {item.label}
                  </span>
                  {item.proBadge && (
                    <span
                      className="font-bold text-[5px] uppercase tracking-[0.08em] px-[3px] py-[0.5px] rounded-full leading-none"
                      style={{
                        background: isActive
                          ? "linear-gradient(135deg, rgba(124,106,237,0.25), rgba(6,182,212,0.15))"
                          : "rgba(124,106,237,0.08)",
                        color: isActive ? "#C4B5FD" : "#8B7DC8",
                        border: isActive ? '0.5px solid rgba(167,139,250,0.2)' : 'none',
                      }}
                    >
                      PRO
                    </span>
                  )}
                </div>

                {/* Active indicator — glowing bar */}
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-indicator"
                    className="absolute -bottom-0 w-8 h-[2.5px] rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #8B5CF6, #06B6D4)',
                      boxShadow: '0 0 8px rgba(139,92,246,0.4), 0 0 16px rgba(139,92,246,0.15)',
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => { haptic(); setMoreOpen(!moreOpen); }}
            className="flex flex-col items-center justify-center gap-[2px] py-1.5 relative haptic-press"
          >
            <motion.div
              whileTap={{ scale: 0.8 }}
              transition={{ type: "spring", stiffness: 600, damping: 25 }}
              animate={moreOpen ? { rotate: 90 } : { rotate: 0 }}
              className={`p-1.5 rounded-xl transition-all duration-300 ${
                isMoreActive || moreOpen
                  ? "bg-gradient-to-br from-[rgba(124,106,237,0.2)] to-[rgba(6,182,212,0.08)]"
                  : ""
              }`}
              style={(isMoreActive || moreOpen) ? {
                boxShadow: '0 0 16px rgba(124,106,237,0.2)',
              } : undefined}
            >
              <MoreHorizontal
                className={`w-[18px] h-[18px] transition-all duration-300 ${
                  isMoreActive || moreOpen
                    ? "text-[#A78BFA] drop-shadow-[0_0_6px_rgba(167,139,250,0.4)]"
                    : "text-[var(--text-tertiary)]"
                }`}
                strokeWidth={isMoreActive || moreOpen ? 2.2 : 1.5}
              />
            </motion.div>
            <span className={`font-body text-[9px] leading-tight transition-all duration-300 ${
              isMoreActive || moreOpen
                ? "text-[#A78BFA] font-semibold"
                : "text-[var(--text-tertiary)]"
            }`}>
              More
            </span>
            {isMoreActive && !moreOpen && (
              <motion.div
                layoutId="mobile-nav-indicator"
                className="absolute -bottom-0 w-8 h-[2.5px] rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #8B5CF6, #06B6D4)',
                  boxShadow: '0 0 8px rgba(139,92,246,0.4), 0 0 16px rgba(139,92,246,0.15)',
                }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        </div>
      </nav>

      {/* More Sheet (slide-up drawer) — premium glass surface */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-[60]"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: 'blur(4px)' }}
              onClick={() => setMoreOpen(false)}
            />

            {/* Sheet */}
            <motion.div
              ref={sheetRef}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-[61] rounded-t-3xl"
              style={{
                background: 'linear-gradient(180deg, rgba(26, 27, 36, 0.98) 0%, rgba(14, 15, 22, 0.99) 100%)',
                border: "1px solid rgba(255,255,255,0.08)",
                borderBottom: "none",
                paddingBottom: "calc(env(safe-area-inset-bottom, 8px) + 16px)",
                boxShadow: '0 -12px 50px rgba(0,0,0,0.5), 0 -2px 0 rgba(124,106,237,0.06), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              </div>

              {/* Close button */}
              <div className="flex items-center justify-between px-5 mb-2">
                <span className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>More</span>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-2 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center transition-all hover:bg-white/5"
                  style={{ color: "var(--text-tertiary)" }}
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>

              {/* Items */}
              <div className="px-3 pb-2 space-y-0.5">
                {moreItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isActive = path === item.to || (item.to !== "/" && path.startsWith(item.to));
                  return (
                    <motion.div
                      key={item.to}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05, duration: 0.2 }}
                    >
                      <Link
                        to={item.to}
                        onClick={() => { haptic(); setMoreOpen(false); }}
                        className={`flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                          isActive ? "" : "active:bg-[rgba(255,255,255,0.04)]"
                        }`}
                        style={isActive ? {
                          background: 'linear-gradient(135deg, rgba(124,106,237,0.12) 0%, rgba(124,106,237,0.04) 100%)',
                          border: '1px solid rgba(124,106,237,0.15)',
                          boxShadow: '0 0 12px rgba(124,106,237,0.08)',
                        } : { border: '1px solid transparent' }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: isActive
                              ? 'linear-gradient(135deg, rgba(124,106,237,0.15), rgba(6,182,212,0.08))'
                              : 'rgba(255,255,255,0.03)',
                          }}
                        >
                          <Icon
                            className="w-[18px] h-[18px]"
                            style={{
                              color: isActive ? "#A78BFA" : "var(--text-tertiary)",
                              filter: isActive ? 'drop-shadow(0 0 4px rgba(167,139,250,0.4))' : 'none',
                            }}
                            strokeWidth={isActive ? 2 : 1.5}
                          />
                        </div>
                        <span
                          className="font-body text-[13px] font-medium flex-1"
                          style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}
                        >
                          {item.label}
                        </span>
                        {item.proBadge && (
                          <span
                            className="font-bold text-[7px] uppercase tracking-widest px-1.5 py-0.5 rounded-md"
                            style={{ background: "linear-gradient(135deg, rgba(124,106,237,0.1), rgba(6,182,212,0.06))", border: '1px solid rgba(124,106,237,0.15)', color: "#9585F2" }}
                          >
                            PRO
                          </span>
                        )}
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default MobileNav;
