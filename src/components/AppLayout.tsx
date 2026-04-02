import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Home, Briefcase, Radio, Sparkles, Bookmark, Trophy, Settings,
  Zap, ChevronLeft, ChevronRight, LogOut, User, Gift, Target, Bell,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProStatus } from "@/hooks/useProStatus";
import { openCheckout, getPlanForUser, getPriceLabel, resolveCheckoutPlan } from "@/utils/checkout";
import { useGamification, LEVELS } from "@/hooks/useGamification";
import { toast } from "@/hooks/use-toast";
import CountdownTimer from "./CountdownTimer";
import TrialBanner from "./TrialBanner";
import MobileNav from "./MobileNav";
import XPToast from "./XPToast";
import LevelUpModal from "./LevelUpModal";
import StreakPopup from "./StreakPopup";

// Page title map
const pageTitles: Record<string, string> = {
  "/feed": "Feed",
  "/use-cases": "Use Cases",
  "/signals": "Signals",
  "/validate": "Validate",
  "/radar": "Pain Radar",
  "/alerts": "Alerts",
  "/saved": "Saved",
  "/leaderboard": "Leaderboard",
  "/settings": "Settings",
  "/referrals": "Referrals",
  "/admin": "Admin",
};

interface NavItemDef {
  to: string;
  icon: React.ComponentType<any>;
  label: string;
  proBadge?: boolean;
  dividerAfter?: boolean;
}

const navItems: NavItemDef[] = [
  { to: "/feed", icon: Home, label: "Feed" },
  { to: "/use-cases", icon: Briefcase, label: "Use Cases", proBadge: true },
  { to: "/signals", icon: Radio, label: "Signals", proBadge: true },
  { to: "/validate", icon: Sparkles, label: "Validate", dividerAfter: true },
  { to: "/radar", icon: Target, label: "Pain Radar", proBadge: true },
  { to: "/alerts", icon: Bell, label: "Alerts", proBadge: true, dividerAfter: true },
  { to: "/saved", icon: Bookmark, label: "Saved" },
  { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { to: "/referrals", icon: Gift, label: "Referrals", dividerAfter: true },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { hasFullAccess, isEarlyAdopter, planStatus, hasUsedTrial } = useProStatus();
  const userPlan = getPlanForUser(isEarlyAdopter);
  const priceLabel = getPriceLabel(isEarlyAdopter);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  // Gamification — single source of truth
  const {
    currentStreak, xp, level, levelEmoji, progressPercent,
    xpEvents, levelUpEvent, streakBroken,
    dismissLevelUp, dismissStreakBroken,
  } = useGamification();

  // Streak popup (mobile)
  const [streakPopupOpen, setStreakPopupOpen] = useState(false);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  // Streak broken toast
  useEffect(() => {
    if (streakBroken) {
      toast({ title: "\u{1F494} Your streak was broken!", description: "Start exploring to build a new streak." });
      dismissStreakBroken();
    }
  }, [streakBroken, dismissStreakBroken]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const pageTitle = pageTitles[location.pathname] ||
    (location.pathname.startsWith("/idea/") ? "Idea" : "");

  return (
    <div className="min-h-screen flex overflow-x-hidden">
      {/* --- Desktop Sidebar --- */}
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-screen z-40 transition-all duration-300 ease-out-expo ${
          collapsed ? "w-16" : "w-60"
        }`}
        style={{
          background: "linear-gradient(180deg, rgba(17, 18, 25, 0.99) 0%, rgba(9, 10, 16, 0.99) 100%)",
          borderRight: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-lg), inset -1px 0 0 rgba(255, 255, 255, 0.03)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <Link to="/feed" className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #7C6AED)", boxShadow: "var(--shadow-sm), 0 0 12px rgba(124,106,237,0.2)" }}
            >
              <Zap className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            {!collapsed && (
              <span className="font-heading text-lg font-bold tracking-tight">
                Idea<span style={{ color: "var(--accent-purple-light)" }}>rupt</span>
              </span>
            )}
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to || (item.to !== "/feed" && location.pathname.startsWith(item.to));
            return (
              <div key={item.to}>
                <Link
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-fast ease-out-expo group relative ${
                    collapsed ? "justify-center" : ""
                  } ${
                    isActive
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)]"
                  }`}
                  style={isActive ? { background: "rgba(124,106,237,0.1)", boxShadow: "inset 0 0 20px rgba(124,106,237,0.04)" } : {}}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                      style={{ background: "var(--accent-purple)" }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                  <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  {!collapsed && (
                    <span className="font-body text-[13px] font-medium flex items-center gap-1.5">
                      {item.label}
                      {item.to === "/radar" && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                        </span>
                      )}
                    </span>
                  )}
                  {!collapsed && item.proBadge && (
                    <span
                      className="font-bold text-[7px] uppercase tracking-widest px-1 py-[1px] rounded-full ml-auto"
                      style={{ background: "rgba(124,106,237,0.1)", color: "var(--accent-purple-light)" }}
                    >
                      PRO
                    </span>
                  )}
                </Link>
                {item.dividerAfter && (
                  <div className="mx-3 my-2 h-px" style={{ background: "var(--border-subtle)" }} />
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar XP progress (expanded only) */}
        {!collapsed && (
          <div className="mx-2 mb-2 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-body text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                {levelEmoji} Lv {level + 1}
              </span>
              <span className="font-body text-[10px] font-bold tabular-nums" style={{ color: "var(--accent-purple-light)" }}>
                {xp.toLocaleString()} XP
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "var(--accent-purple)" }}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        {/* Upgrade / Start Trial card (free/trial-not-started only) */}
        {!hasFullAccess && !collapsed && (
          <div className="mx-2 mb-3 p-3 rounded-xl" style={{
            background: !hasUsedTrial
              ? "linear-gradient(180deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.03) 100%)"
              : "linear-gradient(180deg, rgba(124,106,237,0.08) 0%, rgba(124,106,237,0.03) 100%)",
            border: `1px solid ${!hasUsedTrial ? "rgba(245,158,11,0.15)" : "rgba(124,106,237,0.12)"}`,
            boxShadow: "var(--shadow-xs)",
          }}>
            <p className="font-heading text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {!hasUsedTrial ? "Start Free Trial" : "Upgrade to Pro"}
            </p>
            <p className="font-body text-[11px] mb-2.5" style={{ color: "var(--text-tertiary)" }}>
              {!hasUsedTrial ? "7-day full Pro access" : "Unlock unlimited access"}
            </p>
            <button
              onClick={() => user ? openCheckout(resolveCheckoutPlan(userPlan, hasUsedTrial), user.email || undefined, user.id) : navigate("/auth?redirect=feed")}
              className="w-full py-1.5 rounded-lg text-[11px] font-heading font-semibold text-white transition-all duration-fast"
              style={{
                background: !hasUsedTrial ? "linear-gradient(135deg, #F59E0B, #F97316)" : "linear-gradient(135deg, #8B5CF6, var(--accent-purple))",
                boxShadow: !hasUsedTrial ? "0 2px 8px rgba(245,158,11,0.2)" : "0 2px 8px rgba(124,106,237,0.2)",
              }}
            >
              {!hasUsedTrial ? "Start Trial →" : priceLabel}
            </button>
          </div>
        )}

        {/* User + collapse */}
        <div className="px-2 pb-3 shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 mt-2 rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.04)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(124,106,237,0.5)]"
            style={{ color: "var(--text-tertiary)" }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" strokeWidth={1.5} /> : <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />}
          </button>
          {!collapsed && user && (
            <div className="flex items-center gap-2 px-2 py-2 mt-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #8B5CF6, var(--accent-purple))", boxShadow: "var(--shadow-xs)" }}>
                <User className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-body text-xs truncate" style={{ color: "var(--text-primary)" }}>
                  {user.user_metadata?.full_name || user.email?.split("@")[0] || "User"}
                </p>
                <p className="font-body text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
                  {user.email}
                </p>
              </div>
              <button onClick={handleLogout} className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.04)]" style={{ color: "var(--text-tertiary)" }} aria-label="Sign out">
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* --- Main Content --- */}
      <div className={`flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300 ${collapsed ? "md:ml-16" : "md:ml-60"}`}>
        {/* Trial banner */}
        <TrialBanner />

        {/* Mobile branding header — glass panel */}
        <div
          className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 shrink-0 glass-panel"
          style={{ height: '50px' }}
        >
          <Link to="/feed" className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #7C6AED)", boxShadow: "var(--shadow-sm), 0 0 10px rgba(124,106,237,0.15)" }}
            >
              <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2} />
            </div>
            <span className="font-heading text-[15px] font-bold tracking-tight">
              Idea<span style={{ color: "var(--accent-purple-light)" }}>rupt</span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            {currentStreak > 0 && (
              <button
                onClick={() => setStreakPopupOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full transition-transform active:scale-95 haptic-press"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
              >
                <span className="text-xs" style={{ animation: "flicker 1.5s ease-in-out infinite" }}>&#x1F525;</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{currentStreak}</span>
              </button>
            )}
            {xp > 0 && (
              <button
                onClick={() => setStreakPopupOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-full transition-transform active:scale-95 haptic-press"
                style={{ background: "rgba(124,106,237,0.08)", border: "1px solid rgba(124,106,237,0.15)" }}
              >
                <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: "var(--accent-purple-light)" }}>{xp.toLocaleString()}</span>
                <span className="text-[9px]">&#x26A1;</span>
              </button>
            )}
          </div>
        </div>

        {/* Desktop top header bar — hidden on mobile */}
        <header
          className="hidden md:flex sticky top-0 z-30 items-center justify-between px-4 sm:px-6 h-14 shrink-0"
          style={{
            background: "rgba(9, 10, 16, 0.88)",
            backdropFilter: "blur(28px) saturate(1.6)",
            WebkitBackdropFilter: "blur(28px) saturate(1.6)",
            borderBottom: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-sm), inset 0 -1px 0 rgba(255, 255, 255, 0.03)",
          }}
        >
          <h1 className="font-heading text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {pageTitle}
          </h1>
          <div className="flex items-center gap-2">
            <CountdownTimer />
            {currentStreak > 0 && (
              <button
                onClick={() => setStreakPopupOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-transform active:scale-95 haptic-press"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
              >
                <span className="text-sm" style={{ animation: "flicker 1.5s ease-in-out infinite" }}>&#x1F525;</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{currentStreak}</span>
              </button>
            )}
            {xp > 0 && (
              <button
                onClick={() => setStreakPopupOpen(true)}
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full transition-transform active:scale-95 haptic-press"
                style={{ background: "rgba(124,106,237,0.08)", border: "1px solid rgba(124,106,237,0.15)" }}
              >
                <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color: "var(--accent-purple-light)" }}>{xp.toLocaleString()}</span>
                <span className="text-[10px]">&#x26A1;</span>
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* XP Toast + Level Up + Streak Popup */}
      <XPToast events={xpEvents} />
      <LevelUpModal levelUp={levelUpEvent} onDismiss={dismissLevelUp} />
      <StreakPopup open={streakPopupOpen} onClose={() => setStreakPopupOpen(false)} />
    </div>
  );
};

export default AppLayout;
