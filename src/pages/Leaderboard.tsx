import { useState, useEffect } from "react";
import { motion } from "framer-motion";

import { useAuth } from "@/contexts/AuthContext";
import { useGamification, LEVELS } from "@/hooks/useGamification";
import ProfileBadges from "@/components/ProfileBadges";
import { Trophy, Medal, Crown, ArrowUp } from "lucide-react";
import { trackEvent, EVENTS } from "@/lib/analytics";

const DUMMY_LEADERS = [
  { rank: 1, name: "Alex Chen", score: 2450, badges: ["\u{1F331}","\u{1F50D}","\u{1F4BE}","\u{1F4E2}","\u{1F525}","\u{1F3C6}"] },
  { rank: 2, name: "Priya Sharma", score: 1870, badges: ["\u{1F331}","\u{1F50D}","\u{1F4BE}","\u{1F4E2}","\u{1F525}"] },
  { rank: 3, name: "Jordan Lee", score: 1540, badges: ["\u{1F331}","\u{1F50D}","\u{1F4BE}","\u{1F525}"] },
  { rank: 4, name: "Sam Wilson", score: 1120, badges: ["\u{1F331}","\u{1F50D}","\u{1F4BE}","\u{1F4E2}"] },
  { rank: 5, name: "Maya Patel", score: 890, badges: ["\u{1F331}","\u{1F50D}","\u{1F4BE}"] },
  { rank: 6, name: "Chris Doe", score: 720, badges: ["\u{1F331}","\u{1F50D}","\u{1F4BE}"] },
  { rank: 7, name: "Taylor Kim", score: 580, badges: ["\u{1F331}","\u{1F50D}"] },
  { rank: 8, name: "Riley Brown", score: 430, badges: ["\u{1F331}","\u{1F50D}"] },
  { rank: 9, name: "Morgan Liu", score: 310, badges: ["\u{1F331}","\u{1F50D}"] },
  { rank: 10, name: "Casey Tan", score: 180, badges: ["\u{1F331}"] },
];

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="w-5 h-5" style={{ color: "#FFD700" }} strokeWidth={1.5} />;
  if (rank === 2) return <Medal className="w-5 h-5" style={{ color: "#C0C0C0" }} strokeWidth={1.5} />;
  if (rank === 3) return <Medal className="w-5 h-5" style={{ color: "#CD7F32" }} strokeWidth={1.5} />;
  return <span className="font-heading text-sm font-bold tabular-nums w-5 text-center" style={{ color: 'var(--text-tertiary)' }}>#{rank}</span>;
};

const Leaderboard = () => {
  const { user } = useAuth();
  const { xp, currentStreak, level, levelEmoji, levelName } = useGamification();

  useEffect(() => {
    trackEvent(EVENTS.LEADERBOARD_VIEWED);
  }, []);

  const userRank = DUMMY_LEADERS.findIndex(l => xp > l.score);
  const effectiveRank = userRank === -1 ? 34 : userRank + 1;
  const pointsToTop10 = Math.max(0, (DUMMY_LEADERS[9]?.score ?? 0) - xp + 1);

  return (
    <div className="min-h-screen pb-20 md:pb-0">

      <div className="mx-auto px-4 py-6 max-w-3xl w-full">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <Trophy className="w-6 h-6" style={{ color: '#FFD700' }} strokeWidth={1.5} />
            <h1 className="font-heading text-2xl font-bold tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>Top Builders This Week</h1>
          </div>
          <p className="font-body text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>Ranked by XP earned</p>

          {/* Current user position */}
          {user && (
            <div className="surface-card p-4 mb-6 relative overflow-hidden" style={{ borderColor: 'rgba(124,106,237,0.3)' }}>
              <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(124,106,237,0.1) 0%, transparent 70%)' }} />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    You're ranked #{effectiveRank}
                  </p>
                  <p className="font-body text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {effectiveRank <= 10 ? "\u{1F389} You're in the top 10!" : `Earn ${pointsToTop10.toLocaleString()} more XP to reach top 10!`}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="font-body text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(124,106,237,0.1)', color: 'var(--accent-purple-light)' }}>
                      {levelEmoji} {levelName}
                    </span>
                    {currentStreak > 0 && (
                      <span className="font-body text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B' }}>
                        {"\u{1F525}"} {currentStreak}d streak
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-heading text-lg font-bold tabular-nums" style={{ color: '#9585F2' }}>{xp.toLocaleString()}</span>
                  <span className="font-body text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>XP</span>
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard rows */}
          <div className="space-y-2">
            {DUMMY_LEADERS.map((leader, i) => {
              const isUser = user && effectiveRank === leader.rank;
              return (
                <motion.div
                  key={leader.rank}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 p-3.5 rounded-xl"
                  style={{
                    background: isUser ? 'rgba(124,106,237,0.08)' : 'var(--bg-surface)',
                    border: isUser ? '1px solid rgba(124,106,237,0.3)' : '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="w-8 flex justify-center">{getRankIcon(leader.rank)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {isUser ? "You" : leader.name}
                    </p>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {leader.badges.map((b, j) => <span key={j} className="text-[10px]">{b}</span>)}
                    </div>
                  </div>
                  <span className="font-heading text-sm font-bold tabular-nums" style={{ color: leader.rank <= 3 ? '#FFD700' : 'var(--text-secondary)' }}>
                    {leader.score.toLocaleString()}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Leaderboard;
