import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "What makes Idearupt different from other idea tools?",
    a: "Most tools generate ideas from thin air or run basic keyword analysis. Idearupt is different — every problem we surface is backed by real people complaining in public forums like Reddit, Hacker News, Product Hunt, Indie Hackers, and Stack Overflow. You can click through and read the original posts yourself. We don't guess what people want. We show you proof.",
  },
  {
    q: "Why should I subscribe to Idearupt Pro?",
    a: "Free gives you the full problem feed with idea details, basic scores, and 3 ideas per day. Pro unlocks Pain Radar (live complaint feed by niche), Sniper Mode Alerts (email alerts when problems match your criteria), PDF exports, original Reddit/HN source threads, side-by-side idea comparison, unlimited saves, and higher daily limits on everything.",
  },
  {
    q: "Where do the problems come from?",
    a: "We scan Reddit, Hacker News, Product Hunt, Indie Hackers, Stack Overflow, and GitHub for real complaints people are actively posting. These are problems people want solved — backed by real posts you can click and verify yourself.",
  },
  {
    q: "How is the pain score calculated?",
    a: "Each problem is scored across 5 dimensions: pain level (how desperately people need it), trend momentum, competition density, revenue potential, and build difficulty. The overall score is a weighted average.",
  },
  {
    q: "Can I really build these with no code?",
    a: "Yes. Every problem includes build plans for no-code, low-code, and full-stack approaches. We recommend specific tools and show you step-by-step how to build and launch.",
  },
  {
    q: "How often are new problems added?",
    a: "We add new validated problems every day. Our AI continuously scans communities for fresh complaints and unsolved needs.",
  },
  {
    q: "What's in the Build Blueprint?",
    a: "Each blueprint includes a 90-day roadmap, recommended tech stack with costs, competitor breakdown with pricing exposed, and a launch playbook covering Product Hunt, Reddit, Twitter, and more.",
  },
  {
    q: "Is Idearupt just for technical builders?",
    a: "Not at all. We match problems to your skill level — whether you're a no-code builder, a vibe coder using AI tools, or a full-stack developer. Every build plan adapts to your technical background and available time.",
  },
];

const FAQSection = () => (
  <section id="faq" className="container mx-auto px-4 py-12 sm:py-20 max-w-2xl">
    <motion.p
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="text-center font-body text-xs uppercase tracking-[0.15em] font-medium mb-4"
      style={{ color: 'var(--accent-purple)' }}
    >
      FAQ
    </motion.p>
    <motion.h2
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="font-heading text-[28px] sm:text-[36px] font-bold text-center mb-8 sm:mb-12 tracking-[-0.03em]"
      style={{ color: 'var(--text-primary)' }}
    >
      Questions & answers
    </motion.h2>
    <Accordion type="single" collapsible className="space-y-2.5">
      {faqs.map((faq, i) => (
        <AccordionItem key={i} value={`faq-${i}`} className="glass-card rounded-2xl px-6" style={{ border: '1px solid var(--border-subtle)' }}>
          <AccordionTrigger className="font-heading text-sm font-medium text-left py-5 hover:no-underline" style={{ color: 'var(--text-primary)' }}>
            {faq.q}
          </AccordionTrigger>
          <AccordionContent className="font-body text-sm leading-relaxed pb-5" style={{ color: 'var(--text-secondary)' }}>
            {faq.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  </section>
);

export default FAQSection;