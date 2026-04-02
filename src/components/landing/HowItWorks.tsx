import { motion } from "framer-motion";
import { Radar, Brain, Target } from "lucide-react";

const steps = [
  {
    num: "01",
    icon: Radar,
    title: "We scan thousands of posts daily",
    description: "Reddit, Hacker News, Product Hunt, Indie Hackers, Stack Overflow & GitHub — our AI reads thousands of posts looking for people describing problems they'd pay to solve.",
  },
  {
    num: "02",
    icon: Brain,
    title: "AI scores every problem",
    description: "Each problem gets a pain score based on urgency, frequency, and willingness to pay. Plus competitors with their pricing and weaknesses exposed.",
  },
  {
    num: "03",
    icon: Target,
    title: "You get a build plan",
    description: "Not just a problem — a full 90-day roadmap matched to your skills, budget, and hours. Like having a co-founder on speed dial.",
  },
];

const HowItWorks = () => (
  <section id="how-it-works" className="container mx-auto px-4 py-12 sm:py-20">
    <motion.p
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="text-center font-body text-xs uppercase tracking-[0.15em] font-medium mb-4"
      style={{ color: 'var(--accent-purple)' }}
    >
      How it works
    </motion.p>
    <motion.h2
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="font-heading text-[28px] sm:text-[36px] font-bold text-center mb-8 sm:mb-12 tracking-[-0.03em]"
      style={{ color: 'var(--text-primary)' }}
    >
      From complaint to{" "}
      <span className="text-gradient-purple-cyan">startup in 3 steps</span>
    </motion.h2>
    <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto relative">
      {/* Connecting line */}
      <div className="hidden md:block absolute top-[52px] left-[20%] right-[20%] h-px" style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.2), rgba(6,182,212,0.2))' }} />
      
      {steps.map((step, i) => (
        <motion.div
          key={step.num}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ delay: i * 0.08, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative glass-card rounded-xl p-5 sm:p-8 text-center"
        >
          <div className="w-11 h-11 mx-auto mb-5 rounded-full flex items-center justify-center relative z-10 p-[1px]" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', boxShadow: '0 0 16px rgba(124, 106, 237, 0.2)' }}>
            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(180deg, rgba(26, 27, 36, 0.95), var(--bg-surface))' }}>
              <span className="font-heading text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{step.num}</span>
            </div>
          </div>
          <h3 className="font-heading text-lg font-semibold mb-2.5 tracking-[-0.01em]" style={{ color: 'var(--text-primary)' }}>{step.title}</h3>
          <p className="text-sm leading-relaxed font-body" style={{ color: 'var(--text-secondary)' }}>{step.description}</p>
        </motion.div>
      ))}
    </div>
  </section>
);

export default HowItWorks;