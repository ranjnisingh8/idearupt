import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Terms = () => {
  const updated = "February 14, 2026";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-body mb-6 hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-tertiary)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Home
        </Link>

        <h1
          className="font-heading text-2xl sm:text-3xl font-bold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Terms of Service
        </h1>
        <p className="font-body text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
          Last updated: {updated}
        </p>

        <div className="space-y-6 font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using Idearupt ("the Service"), you agree to be bound by these Terms of
              Service. If you do not agree, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              2. Description of Service
            </h2>
            <p>
              Idearupt is a platform that surfaces validated startup problems backed by real user
              complaints from public forums. We provide AI-powered analysis including problem validation,
              competitor intelligence, build blueprints, and personalized matching.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              3. User Accounts
            </h2>
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li>You must provide a valid email address to create an account</li>
              <li>You are responsible for maintaining the security of your account</li>
              <li>One account per person — no automated or bot accounts</li>
              <li>We reserve the right to suspend accounts that violate these terms</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              4. Free & Pro Tiers
            </h2>
            <p>
              Idearupt offers a free tier with daily usage limits and a paid Pro tier with expanded
              limits and exclusive features. Daily limits reset at midnight UTC. Free-tier features
              may change as we refine the product.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              5. Payments & Billing
            </h2>
            <p>
              Pro subscriptions are billed monthly through Stripe. You can cancel anytime from
              your account settings. Cancellation takes effect at the end of the current billing
              period — no partial refunds for the remaining days.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              6. Content & Intellectual Property
            </h2>
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li>Ideas displayed on Idearupt are sourced from public forums and processed by AI</li>
              <li>AI-generated content (blueprints, validations) is provided for informational purposes only</li>
              <li>You may use AI-generated content for your own projects without restriction</li>
              <li>You may not scrape, resell, or redistribute Idearupt data at scale</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              7. Disclaimers
            </h2>
            <p>
              Idearupt is provided "as is" without warranties of any kind. We do not guarantee
              the accuracy of AI-generated content, revenue projections, or competitor data.
              Idearupt is not financial or legal advice. Always do your own research before
              making business decisions.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              8. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, Idearupt and its operators shall not be
              liable for any indirect, incidental, or consequential damages arising from your
              use of the Service.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              9. Changes to Terms
            </h2>
            <p>
              We may update these terms from time to time. Material changes will be communicated
              via email or in-app notice. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              10. Contact
            </h2>
            <p>
              Questions? Reach us at{" "}
              <a
                href="mailto:hello@idearupt.ai"
                className="underline hover:opacity-80"
                style={{ color: "var(--accent-purple)" }}
              >
                hello@idearupt.ai
              </a>
            </p>
          </section>
        </div>
      </div>

    </div>
  );
};

export default Terms;
