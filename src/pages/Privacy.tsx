import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Privacy = () => {
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
          Privacy Policy
        </h1>
        <p className="font-body text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
          Last updated: {updated}
        </p>

        <div className="space-y-6 font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              1. Information We Collect
            </h2>
            <p>
              When you create an account, we collect your email address and display name.
              We also collect anonymized usage data (pages visited, features used, session duration)
              to improve the product. We do not sell your data to third parties.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              2. How We Use Your Data
            </h2>
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li>Provide and improve the Idearupt service</li>
              <li>Personalize your idea feed using Builder DNA preferences</li>
              <li>Send transactional emails (account verification, password resets)</li>
              <li>Aggregate anonymous analytics to guide product decisions</li>
              <li>Enforce usage limits and prevent abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              3. Data Storage & Security
            </h2>
            <p>
              Your data is stored securely on Supabase infrastructure with row-level security (RLS)
              policies ensuring you can only access your own data. All connections are encrypted via TLS.
              We do not store payment details directly — all payments are processed through Stripe.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              4. Cookies & Analytics
            </h2>
            <p>
              We use first-party cookies for authentication sessions. We use Google Analytics and
              PostHog for anonymized product analytics. You can disable analytics by using a
              browser extension like uBlock Origin.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              5. Third-Party Services
            </h2>
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li><strong>Supabase</strong> — Authentication, database, and file storage</li>
              <li><strong>Stripe</strong> — Payment processing (when Pro launches)</li>
              <li><strong>Google Analytics</strong> — Anonymized usage analytics</li>
              <li><strong>PostHog</strong> — Product analytics and session replay</li>
              <li><strong>OpenAI</strong> — AI-powered idea validation and blueprint generation</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              6. Your Rights
            </h2>
            <p>
              You can request deletion of your account and all associated data at any time by
              emailing us. We will process deletion requests within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              7. Changes to This Policy
            </h2>
            <p>
              We may update this policy from time to time. Significant changes will be communicated
              via email or an in-app notification. Continued use of Idearupt after changes constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              8. Contact
            </h2>
            <p>
              Questions about this policy? Email us at{" "}
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

export default Privacy;
