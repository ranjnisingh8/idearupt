import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BadgeInfo {
  emoji: string;
  name: string;
  description: string;
  earned: boolean;
}

interface ProfileBadgesProps {
  ideasViewed: number;
  ideasSaved: number;
  ideasShared: number;
  currentStreak: number;
  longestStreak?: number;
}

const getBadges = ({ ideasViewed, ideasSaved, ideasShared, currentStreak, longestStreak }: ProfileBadgesProps): BadgeInfo[] => {
  const streak = longestStreak ?? currentStreak;
  return [
    { emoji: "\u{1F331}", name: "Seedling", description: "Signed up", earned: true },
    { emoji: "\u{1F50D}", name: "Explorer", description: "View 10+ ideas", earned: ideasViewed >= 10 },
    { emoji: "\u{1F4BE}", name: "Collector", description: "Save 5+ ideas", earned: ideasSaved >= 5 },
    { emoji: "\u{1F4E2}", name: "Amplifier", description: "Share 3+ ideas", earned: ideasShared >= 3 },
    { emoji: "\u{2B50}", name: "Getting Started", description: "3-day streak", earned: streak >= 3 },
    { emoji: "\u{1F525}", name: "Streak Master", description: "7-day streak", earned: streak >= 7 },
    { emoji: "\u{1F9E0}", name: "Builder Brain", description: "14-day streak", earned: streak >= 14 },
    { emoji: "\u{1F3C6}", name: "Founder Mode", description: "30-day streak", earned: streak >= 30 },
    { emoji: "\u{1F4A0}", name: "Obsessed", description: "60-day streak", earned: streak >= 60 },
    { emoji: "\u{1F48E}", name: "Century", description: "100-day streak", earned: streak >= 100 },
  ];
};

export const getBadgeCount = (props: ProfileBadgesProps) => {
  const badges = getBadges(props);
  return badges.filter(b => b.earned).length;
};

const ProfileBadges = (props: ProfileBadgesProps) => {
  const badges = getBadges(props);
  const earnedCount = badges.filter(b => b.earned).length;

  return (
    <div>
      <div className="flex items-center gap-1 flex-wrap">
        {badges.map((badge) => (
          <Tooltip key={badge.name}>
            <TooltipTrigger asChild>
              <motion.span
                className="text-sm cursor-default select-none"
                style={{
                  filter: badge.earned ? "none" : "grayscale(1) opacity(0.3)",
                  transition: "filter 0.3s ease",
                }}
                whileHover={badge.earned ? { scale: 1.2 } : {}}
              >
                {badge.emoji}
              </motion.span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
              <p className="font-heading font-semibold">{badge.name}</p>
              <p style={{ color: 'var(--text-tertiary)' }}>{badge.earned ? "\u2705 Earned" : badge.description}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <p className="font-body text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
        {earnedCount}/{badges.length} badges earned
      </p>
    </div>
  );
};

export default ProfileBadges;
