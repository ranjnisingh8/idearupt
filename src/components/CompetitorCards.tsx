import { Star } from "lucide-react";

interface Competitor {
  name: string;
  description: string;
  estimated_mrr: string;
  tech_stack: string[];
  marketing_channels: string[];
  rating: number;
  weakness: string;
  gap_opportunity: string;
}

const generateMockCompetitors = (category: string, title: string): Competitor[] => {
  const templates: Record<string, Competitor[]> = {
    saas: [
      { name: "StreamSync Pro", description: "Enterprise workflow automation platform", estimated_mrr: "$45K/mo", tech_stack: ["React", "Node.js", "PostgreSQL"], marketing_channels: ["SEO", "Content", "LinkedIn"], rating: 3.6, weakness: "Complex onboarding, no free tier, slow customer support", gap_opportunity: "Build a simpler, AI-first alternative with instant setup" },
      { name: "FlowBase", description: "All-in-one business process tool", estimated_mrr: "$28K/mo", tech_stack: ["Vue.js", "Python", "MongoDB"], marketing_channels: ["Product Hunt", "Twitter", "Ads"], rating: 4.1, weakness: "Clunky mobile experience, limited integrations", gap_opportunity: "Mobile-first design with extensive API marketplace" },
      { name: "TaskWeave", description: "Team collaboration and task management", estimated_mrr: "$15K/mo", tech_stack: ["Angular", "Java", "MySQL"], marketing_channels: ["SEO", "Referrals"], rating: 3.9, weakness: "Outdated UI, no AI features, expensive enterprise tier", gap_opportunity: "Modern UI with AI-powered task prioritization at lower price" },
    ],
    ai: [
      { name: "NeuralFlow", description: "AI content generation platform", estimated_mrr: "$60K/mo", tech_stack: ["Python", "FastAPI", "GPT-4"], marketing_channels: ["Twitter", "YouTube", "Product Hunt"], rating: 3.8, weakness: "Generic outputs, no brand voice training", gap_opportunity: "Custom AI models that learn your brand voice" },
      { name: "AutoBrain", description: "AI automation for small businesses", estimated_mrr: "$35K/mo", tech_stack: ["React", "Python", "AWS"], marketing_channels: ["SEO", "Webinars", "Partnerships"], rating: 4.0, weakness: "Steep learning curve, developer-focused", gap_opportunity: "No-code AI automation for non-technical users" },
      { name: "SmartAssist", description: "AI-powered customer service bot", estimated_mrr: "$20K/mo", tech_stack: ["Node.js", "OpenAI", "Redis"], marketing_channels: ["Content", "LinkedIn", "Cold email"], rating: 3.5, weakness: "Poor multilingual support, limited customization", gap_opportunity: "Fully customizable, multilingual AI support agent" },
    ],
    default: [
      { name: "MarketLeader", description: "Established player in this space", estimated_mrr: "$50K/mo", tech_stack: ["React", "Node.js", "AWS"], marketing_channels: ["SEO", "Content", "Ads"], rating: 3.7, weakness: "Bloated features, high pricing, slow innovation", gap_opportunity: "Lean, focused alternative at 1/3 the price" },
      { name: "OldGuard", description: "Legacy solution with large user base", estimated_mrr: "$30K/mo", tech_stack: ["jQuery", "PHP", "MySQL"], marketing_channels: ["SEO", "Referrals"], rating: 3.4, weakness: "Outdated tech stack, poor UX, no mobile app", gap_opportunity: "Modern, mobile-first rebuild with AI features" },
      { name: "NewChallenger", description: "Recent entrant with VC funding", estimated_mrr: "$12K/mo", tech_stack: ["Next.js", "Supabase", "Vercel"], marketing_channels: ["Twitter", "Product Hunt", "Influencers"], rating: 4.2, weakness: "Limited features, small team, unclear roadmap", gap_opportunity: "Move faster with more features and better support" },
    ],
  };
  return templates[category.toLowerCase()] || templates.default;
};

interface CompetitorCardsProps {
  category: string;
  title: string;
}

const CompetitorCards = ({ category, title }: CompetitorCardsProps) => {
  const competitors = generateMockCompetitors(category, title);

  return (
    <section className="mb-6">
      <h3 className="font-heading text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Competitor Landscape
      </h3>

      <div className="space-y-3">
          {competitors.map((c) => (
            <div key={c.name} className="surface-card rounded-xl p-4" style={{ transform: 'none' }}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-heading text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{c.name}</h4>
                <span className="font-body text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>{c.estimated_mrr}</span>
              </div>
              <p className="font-body text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{c.description}</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {c.tech_stack.map((t) => <span key={t} className="font-body text-[10px] px-2 py-0.5 rounded-md" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>{t}</span>)}
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {c.marketing_channels.map((m) => <span key={m} className="font-body text-[10px] px-2 py-0.5 rounded-md" style={{ border: '1px solid rgba(6,182,212,0.2)', color: 'rgba(6,182,212,0.7)' }}>{m}</span>)}
              </div>
              <div className="flex items-center gap-1 mb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-3 h-3 ${i < Math.floor(c.rating) ? "text-warning fill-warning" : ""}`} style={i >= Math.floor(c.rating) ? { color: 'rgba(255,255,255,0.1)' } : {}} strokeWidth={1.5} />
                ))}
                <span className="font-body text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>{c.rating}</span>
              </div>
              <div className="rounded-lg p-3 mb-2" style={{ background: 'var(--bg-elevated)' }}>
                <p className="font-body text-[11px] uppercase tracking-[0.04em] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Weakness</p>
                <p className="font-body text-xs italic" style={{ color: 'var(--text-secondary)' }}>"{c.weakness}"</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)' }}>
                <p className="font-body text-[11px] uppercase tracking-[0.04em] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Your Opportunity</p>
                <p className="font-body text-xs" style={{ color: '#34D399' }}>{c.gap_opportunity}</p>
              </div>
            </div>
          ))}
        </div>
    </section>
  );
};

export default CompetitorCards;