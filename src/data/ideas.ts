export interface Idea {
  id: string;
  title: string;
  oneLiner: string;
  description: string;
  created_at?: string;
  category: string;
  categoryColor: string;
  overall_score: number;
  scores: {
    pain_score: number;
    trend_score: number;
    competition_score: number;
    revenue_potential: number;
    build_difficulty: number;
  };
  targetAudience: string;
  estimatedMRR: string;
  tags: string[];
  is_trending: boolean;
  save_count: number;
  build_count: number;
  view_count?: number;
  techLevel?: "no-code" | "low-code" | "full-stack";
  problem_size?: "small" | "medium" | "large";
  problem_statement?: string;
  tech_level_min?: string;
  budget_min?: string;
  estimated_mrr_range?: string;
  source?: string;
  source_url?: string;
  // Proof columns — credibility metrics
  distinct_posters?: number;
  distinct_communities?: number;
  recurrence_weeks?: number;
  pain_type?: "paid" | "vocal" | "latent";
  source_threads?: { url: string; title: string; platform: string; upvotes?: number; comments?: number; subreddit?: string }[];
  wtp_quotes?: { quote: string; source: string; url?: string; upvotes?: number }[];
  validation_data?: {
    source_url?: string;
    source_platform?: string;
    engagement_score?: number;
    upvotes?: number;
    comments?: number;
    subreddit?: string;
    discovered_at?: string;
    competitors?: {
      name: string;
      url: string;
      pricing: string;
      weakness: string;
      estimated_revenue: string;
      rating: string;
    }[];
    real_feedback?: {
      quote: string;
      source: string;
      upvotes: number;
      sentiment: string;
    }[];
  };
  blueprint: {
    noCode: BlueprintTab;
    lowCode: BlueprintTab;
    fullStack: BlueprintTab;
  };
  // Pre-generated AI content (from pre-generate-content edge function)
  blueprint_markdown?: string | null;
  blueprint_generated_at?: string | null;
  competitor_analysis_pregenerated?: { name: string; url: string; pricing: string; weakness: string; estimated_revenue: string; rating: string }[] | null;
  competitor_generated_at?: string | null;
}

export interface BlueprintTab {
  stack: { name: string; cost: string; description: string }[];
  steps: { title: string; description: string; time: string }[];
  totalMonthlyCost: string;
  timeline: string;
  launchPlaybook: string[];
}

const defaultBlueprint: BlueprintTab = {
  stack: [
    { name: "Lovable", cost: "$0-20/mo", description: "AI-powered app builder" },
    { name: "Supabase", cost: "$0-25/mo", description: "Database & auth" },
    { name: "Vercel", cost: "$0/mo", description: "Hosting & deployment" },
  ],
  steps: [
    { title: "Set up project & auth", description: "Create the base app with user authentication and database schema.", time: "Day 1" },
    { title: "Build core features", description: "Implement the main functionality and user flows.", time: "Day 2-3" },
    { title: "Add payments", description: "Integrate Stripe for subscriptions or one-time payments.", time: "Day 4" },
    { title: "Polish & test", description: "Refine the UI, fix bugs, and test edge cases.", time: "Day 5" },
    { title: "Launch", description: "Deploy and share on Product Hunt, Reddit, and Twitter.", time: "Day 6-7" },
  ],
  totalMonthlyCost: "$0-45/mo",
  timeline: "1 week",
  launchPlaybook: [
    "Launch on Product Hunt (Tuesday-Thursday)",
    "Post in relevant subreddits",
    "Share on Twitter/X with demo video",
    "Post in Indie Hackers forum",
  ],
};

export const sampleIdeas: Idea[] = [
  {
    id: "1",
    title: "AI Meeting Notes for Freelancers",
    oneLiner: "Auto-transcribe client calls, extract action items, and generate follow-up emails. Built for solo consultants who hate admin work.",
    description: "Freelancers spend 5+ hours/week on meeting admin. This tool records Zoom/Meet calls, uses AI to extract key decisions, action items, and generates professional follow-up emails. Integrates with calendars and project management tools.",
    category: "SaaS",
    categoryColor: "bg-primary",
    overall_score: 8.4,
    scores: { pain_score: 9, trend_score: 8, competition_score: 7, revenue_potential: 9, build_difficulty: 8 },
    targetAudience: "Freelance consultants, coaches, and agencies",
    estimatedMRR: "$5K-$25K",
    tags: ["AI", "Productivity", "Freelance"],
    is_trending: true,
    save_count: 47,
    build_count: 12,
    techLevel: "low-code",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "2",
    title: "Micro-SaaS Churn Predictor",
    oneLiner: "Predict which customers will cancel before they do. Simple dashboard for small SaaS teams.",
    description: "Most SaaS tools lose 5-7% of customers monthly. This tool analyzes usage patterns and flags at-risk accounts before they churn. Simple to integrate, designed for teams under 1000 customers.",
    category: "Tool",
    categoryColor: "bg-secondary",
    overall_score: 7.8,
    scores: { pain_score: 8, trend_score: 7, competition_score: 6, revenue_potential: 9, build_difficulty: 7 },
    targetAudience: "Small SaaS founders and product teams",
    estimatedMRR: "$3K-$15K",
    tags: ["Analytics", "SaaS", "Retention"],
    is_trending: false,
    save_count: 32,
    build_count: 5,
    techLevel: "full-stack",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "3",
    title: "Content Repurposer for Creators",
    oneLiner: "Turn one blog post into 20 social posts, a newsletter, and a video script. Automatic, on-brand.",
    description: "Content creators spend 70% of their time repurposing. This tool takes one piece of content and generates platform-specific variations for Twitter, LinkedIn, Instagram, email, and YouTube — all matching the creator's voice and style.",
    category: "AI",
    categoryColor: "bg-primary",
    overall_score: 8.1,
    scores: { pain_score: 9, trend_score: 9, competition_score: 5, revenue_potential: 8, build_difficulty: 7 },
    targetAudience: "Content creators, solopreneurs, marketing teams",
    estimatedMRR: "$8K-$40K",
    tags: ["AI", "Content", "Marketing"],
    is_trending: true,
    save_count: 89,
    build_count: 18,
    techLevel: "low-code",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "4",
    title: "Niche Job Board Builder",
    oneLiner: "Launch a niche job board in minutes. Monetize with featured listings and recruiter subscriptions.",
    description: "Generic job boards are saturated, but niche boards (e.g., 'AI jobs in healthcare') command premium pricing. This platform lets you launch a branded job board for any niche with built-in payments, applicant tracking, and SEO.",
    category: "Platform",
    categoryColor: "bg-secondary",
    overall_score: 7.2,
    scores: { pain_score: 7, trend_score: 6, competition_score: 8, revenue_potential: 8, build_difficulty: 6 },
    targetAudience: "Community builders, industry experts, recruiters",
    estimatedMRR: "$2K-$20K",
    tags: ["Marketplace", "HR", "Community"],
    is_trending: false,
    save_count: 21,
    build_count: 3,
    techLevel: "no-code",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "5",
    title: "API Uptime Monitor for Indie Hackers",
    oneLiner: "Dead-simple uptime monitoring for small projects. Alerts via SMS, Slack, and email. $5/mo.",
    description: "Enterprise monitoring tools are overkill for indie hackers. This is a stripped-down uptime monitor that checks your APIs every 60 seconds, sends instant alerts, and shows a beautiful status page. Priced for bootstrappers.",
    category: "Dev Tool",
    categoryColor: "bg-accent",
    overall_score: 6.9,
    scores: { pain_score: 7, trend_score: 5, competition_score: 4, revenue_potential: 6, build_difficulty: 9 },
    targetAudience: "Indie hackers, solo developers, small teams",
    estimatedMRR: "$1K-$8K",
    tags: ["DevOps", "Monitoring", "Infrastructure"],
    is_trending: false,
    save_count: 14,
    build_count: 2,
    techLevel: "full-stack",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "6",
    title: "AI Customer Testimonial Collector",
    oneLiner: "Automatically collect, curate, and display customer testimonials. Social proof on autopilot.",
    description: "Getting testimonials is awkward. This tool sends personalized requests at the right moment (after a positive interaction), collects video/text testimonials, and generates embeddable widgets for your site.",
    category: "SaaS",
    categoryColor: "bg-primary",
    overall_score: 7.6,
    scores: { pain_score: 8, trend_score: 7, competition_score: 6, revenue_potential: 7, build_difficulty: 8 },
    targetAudience: "SaaS companies, agencies, e-commerce brands",
    estimatedMRR: "$4K-$20K",
    tags: ["Marketing", "Social Proof", "Automation"],
    is_trending: true,
    save_count: 56,
    build_count: 9,
    techLevel: "low-code",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "7",
    title: "Subscription Box Analytics",
    oneLiner: "Analytics dashboard built for subscription box businesses. Track LTV, churn, and box costs in one place.",
    description: "Subscription box businesses have unique metrics. This dashboard tracks subscriber LTV, box COGS, churn prediction, and product popularity — all in a clean interface designed for physical subscription products.",
    category: "Analytics",
    categoryColor: "bg-secondary",
    overall_score: 6.5,
    scores: { pain_score: 6, trend_score: 5, competition_score: 7, revenue_potential: 7, build_difficulty: 6 },
    targetAudience: "Subscription box founders and operators",
    estimatedMRR: "$2K-$10K",
    tags: ["E-commerce", "Analytics", "Subscriptions"],
    is_trending: false,
    save_count: 8,
    build_count: 1,
    techLevel: "low-code",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "8",
    title: "Cold Email Warmup Tool",
    oneLiner: "Warm up new email domains automatically. Improve deliverability before you send a single cold email.",
    description: "New domains get flagged as spam. This tool gradually warms up your email domain by sending and receiving realistic emails, building sender reputation over 2-4 weeks so your cold emails actually land in inboxes.",
    category: "Tool",
    categoryColor: "bg-accent",
    overall_score: 8.0,
    scores: { pain_score: 9, trend_score: 8, competition_score: 5, revenue_potential: 8, build_difficulty: 6 },
    targetAudience: "Sales teams, agencies, B2B startups",
    estimatedMRR: "$5K-$30K",
    tags: ["Sales", "Email", "Growth"],
    is_trending: true,
    save_count: 73,
    build_count: 14,
    techLevel: "full-stack",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "9",
    title: "Notion Template Marketplace",
    oneLiner: "A curated marketplace for premium Notion templates. Creators sell, buyers save hours of setup.",
    description: "Notion templates are a booming market but discovery is fragmented. This marketplace curates the best templates, handles payments, and gives creators analytics and promotion tools.",
    category: "Marketplace",
    categoryColor: "bg-primary",
    overall_score: 7.0,
    scores: { pain_score: 6, trend_score: 8, competition_score: 5, revenue_potential: 7, build_difficulty: 8 },
    targetAudience: "Notion power users, template creators, productivity enthusiasts",
    estimatedMRR: "$3K-$15K",
    tags: ["Marketplace", "Productivity", "Templates"],
    is_trending: false,
    save_count: 29,
    build_count: 4,
    techLevel: "no-code",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
  {
    id: "10",
    title: "Waitlist + Launch Page Builder",
    oneLiner: "Build beautiful waitlist pages with viral referral mechanics in 5 minutes. No code needed.",
    description: "Every startup needs a waitlist page but building one with referral tracking, analytics, and email collection is surprisingly hard. This tool generates polished launch pages with built-in viral loops.",
    category: "Tool",
    categoryColor: "bg-secondary",
    overall_score: 7.4,
    scores: { pain_score: 7, trend_score: 7, competition_score: 6, revenue_potential: 7, build_difficulty: 9 },
    targetAudience: "Pre-launch startups, indie hackers, product makers",
    estimatedMRR: "$2K-$12K",
    tags: ["Launch", "Marketing", "No-Code"],
    is_trending: false,
    save_count: 35,
    build_count: 7,
    techLevel: "no-code",
    blueprint: { noCode: defaultBlueprint, lowCode: defaultBlueprint, fullStack: defaultBlueprint },
  },
];
