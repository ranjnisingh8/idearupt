const items = [
  "SaaS tools",
  "Chrome Extensions",
  "AI Wrappers",
  "Marketplaces",
  "Dev Tools",
  "Mobile Apps",
  "API Products",
  "No-Code Apps",
];

const SocialProofTicker = () => (
  <div className="relative overflow-hidden py-6" style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
    <div className="absolute left-0 top-0 bottom-0 w-24 z-10" style={{ background: 'linear-gradient(to right, var(--bg-base), transparent)' }} />
    <div className="absolute right-0 top-0 bottom-0 w-24 z-10" style={{ background: 'linear-gradient(to left, var(--bg-base), transparent)' }} />
    <div
      className="flex gap-8 whitespace-nowrap hover:[animation-play-state:paused]"
      style={{ animation: "scroll-x 30s linear infinite", width: "max-content" }}
    >
      {[...items, ...items].map((item, i) => (
        <span key={i} className="font-body text-sm flex items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(139,92,246,0.4)' }} />
          {item}
        </span>
      ))}
    </div>
  </div>
);

export default SocialProofTicker;