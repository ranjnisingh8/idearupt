export interface Challenge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  action: string; // matches user_interactions action
  target: number;
  xpReward: number;
}

const CHALLENGE_POOL: Challenge[] = [
  {
    id: "explore-3",
    emoji: "\u{1F50D}",
    title: "Explorer Mode",
    description: "View 3 ideas today",
    action: "viewed",
    target: 3,
    xpReward: 50,
  },
  {
    id: "save-2",
    emoji: "\u{1F4BE}",
    title: "Curate & Collect",
    description: "Save 2 ideas today",
    action: "saved",
    target: 2,
    xpReward: 50,
  },
  {
    id: "share-1",
    emoji: "\u{1F4E2}",
    title: "Spread the Word",
    description: "Share 1 idea today",
    action: "shared",
    target: 1,
    xpReward: 50,
  },
  {
    id: "explore-5",
    emoji: "\u{1F680}",
    title: "Deep Dive",
    description: "View 5 ideas today",
    action: "viewed",
    target: 5,
    xpReward: 50,
  },
  {
    id: "save-3",
    emoji: "\u{2B50}",
    title: "Star Collector",
    description: "Save 3 ideas today",
    action: "saved",
    target: 3,
    xpReward: 50,
  },
  {
    id: "share-2",
    emoji: "\u{1F310}",
    title: "Network Builder",
    description: "Share 2 ideas today",
    action: "shared",
    target: 2,
    xpReward: 50,
  },
  {
    id: "explore-7",
    emoji: "\u{1F3AF}",
    title: "Problem Hunter",
    description: "View 7 ideas today",
    action: "viewed",
    target: 7,
    xpReward: 50,
  },
];

/**
 * Get today's challenge — deterministic daily rotation by day-of-year
 */
export const getTodaysChallenge = (): Challenge => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return CHALLENGE_POOL[dayOfYear % CHALLENGE_POOL.length];
};
