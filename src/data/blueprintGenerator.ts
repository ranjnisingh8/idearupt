import { BlueprintTab } from "./ideas";

export type TechLevel = "no_code" | "low_code" | "full_stack";

const blueprints: Record<TechLevel, BlueprintTab> = {
  no_code: {
    stack: [
      { name: "Bubble", cost: "$29/mo", description: "Visual app builder with full logic" },
      { name: "Airtable", cost: "$0-20/mo", description: "Database & backend" },
      { name: "Zapier", cost: "$0-20/mo", description: "Automation & integrations" },
      { name: "Stripe", cost: "2.9% + $0.30", description: "Payment processing" },
      { name: "Carrd", cost: "$9/yr", description: "Landing page for launch" },
    ],
    steps: [
      { title: "Map out your data model", description: "Define the core entities, fields, and relationships in Airtable or Bubble's database.", time: "2 hours" },
      { title: "Build the signup & login flow", description: "Use Bubble's built-in auth to create registration, login, and password reset pages.", time: "3 hours" },
      { title: "Create the main dashboard", description: "Design the primary user-facing view with repeating groups, filters, and search.", time: "4 hours" },
      { title: "Add core workflows", description: "Wire up the key actions: creating, editing, deleting records, and triggering notifications.", time: "4 hours" },
      { title: "Integrate payments", description: "Connect Stripe via Bubble's plugin to handle subscriptions or one-time charges.", time: "2 hours" },
      { title: "Set up automations", description: "Use Zapier to automate email sequences, Slack alerts, and third-party syncs.", time: "2 hours" },
      { title: "Launch & collect feedback", description: "Deploy to a custom domain, announce on socials, and set up a feedback widget.", time: "3 hours" },
    ],
    totalMonthlyCost: "$29-69/mo",
    timeline: "1-2 weeks",
    launchPlaybook: [
      "Create a Carrd landing page with email capture before building",
      "Launch on Product Hunt (aim for Tuesday-Thursday)",
      "Post a build-in-public thread on Twitter/X",
      "Share in relevant Facebook and Reddit communities",
      "Offer 50% off lifetime deal for first 20 customers",
    ],
  },
  low_code: {
    stack: [
      { name: "Lovable", cost: "$0-20/mo", description: "AI-powered app builder" },
      { name: "Supabase", cost: "$0-25/mo", description: "PostgreSQL database, auth & storage" },
      { name: "Vercel", cost: "$0/mo", description: "Frontend hosting & edge functions" },
      { name: "Stripe", cost: "2.9% + $0.30", description: "Payment processing" },
      { name: "Resend", cost: "$0-20/mo", description: "Transactional email API" },
    ],
    steps: [
      { title: "Set up project & database schema", description: "Scaffold the app in Lovable, configure Supabase tables, and set up Row Level Security.", time: "3 hours" },
      { title: "Build authentication flows", description: "Implement email/password and OAuth sign-in using Supabase Auth with protected routes.", time: "2 hours" },
      { title: "Create the core UI & data layer", description: "Build the main pages, forms, and data-fetching hooks with React Query.", time: "6 hours" },
      { title: "Implement business logic", description: "Add server-side validation, edge functions for complex operations, and real-time subscriptions.", time: "5 hours" },
      { title: "Integrate payments & billing", description: "Set up Stripe Checkout, webhooks via edge functions, and a customer portal.", time: "4 hours" },
      { title: "Add email notifications", description: "Configure transactional emails for onboarding, receipts, and alerts using Resend.", time: "2 hours" },
      { title: "QA, deploy & launch", description: "Test all flows, deploy to Vercel, connect a custom domain, and execute your launch plan.", time: "4 hours" },
    ],
    totalMonthlyCost: "$0-65/mo",
    timeline: "2-3 weeks",
    launchPlaybook: [
      "Validate with 5-10 beta users before public launch",
      "Write a detailed Indie Hackers build log",
      "Launch on Product Hunt with a demo video",
      "Post in relevant subreddits with value-first framing",
      "Set up a simple referral program for early adopters",
    ],
  },
  full_stack: {
    stack: [
      { name: "Next.js / React", cost: "$0", description: "Frontend framework with SSR" },
      { name: "PostgreSQL", cost: "$0-15/mo", description: "Relational database via Supabase or Railway" },
      { name: "Redis", cost: "$0-10/mo", description: "Caching & rate limiting" },
      { name: "Stripe", cost: "2.9% + $0.30", description: "Payment processing" },
      { name: "AWS S3 / Cloudflare R2", cost: "$0-5/mo", description: "File storage & CDN" },
      { name: "GitHub Actions", cost: "$0", description: "CI/CD pipelines" },
    ],
    steps: [
      { title: "Architect the system", description: "Design the database schema, API contracts, and service boundaries. Set up the monorepo or project structure.", time: "4 hours" },
      { title: "Implement auth & user management", description: "Build JWT-based auth with refresh tokens, role-based access control, and session management.", time: "5 hours" },
      { title: "Build the API layer", description: "Create RESTful or tRPC endpoints with input validation, error handling, and rate limiting.", time: "8 hours" },
      { title: "Develop the frontend", description: "Build responsive pages with optimistic updates, loading states, error boundaries, and SSR.", time: "10 hours" },
      { title: "Integrate payments & webhooks", description: "Implement Stripe subscriptions, metered billing, webhook handlers, and invoice management.", time: "6 hours" },
      { title: "Add infrastructure & monitoring", description: "Set up CI/CD, logging, error tracking (Sentry), and performance monitoring.", time: "4 hours" },
      { title: "Security audit, test & launch", description: "Run security checks, write integration tests, load test, and deploy with zero-downtime.", time: "6 hours" },
    ],
    totalMonthlyCost: "$0-30/mo",
    timeline: "3-5 weeks",
    launchPlaybook: [
      "Get 10-20 private beta users to stress-test the product",
      "Launch on Hacker News with a technical deep-dive post",
      "Submit to Product Hunt with polished assets",
      "Write a technical blog post about the architecture",
      "Reach out to niche newsletter curators for coverage",
    ],
  },
};

export function generateBlueprint(techLevel?: TechLevel): Record<TechLevel, BlueprintTab> {
  return blueprints;
}

export function getDefaultTab(techLevel?: TechLevel | string): string {
  switch (techLevel) {
    case "no_code": return "No-Code";
    case "full_stack": return "Full-Stack";
    case "low_code":
    default: return "Low-Code";
  }
}
