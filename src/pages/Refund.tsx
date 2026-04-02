import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Refund = () => {
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
          Refund Policy
        </h1>
        <p className="font-body text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
          Last updated: {updated}
        </p>

        <div className="space-y-6 font-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Overview
            </h2>
            <p>
              Idearupt Pro is a monthly subscription. We want every subscriber to be happy
              with the service, so we offer a straightforward refund policy.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              7-Day Satisfaction Guarantee
            </h2>
            <p>
              If you're not satisfied with Pro, you can request a full refund within 7 days of
              your first payment. No questions asked. Email us at{" "}
              <a
                href="mailto:hello@idearupt.ai"
                className="underline hover:opacity-80"
                style={{ color: "var(--accent-purple)" }}
              >
                hello@idearupt.ai
              </a>{" "}
              and we'll process it within 3-5 business days.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Cancellation
            </h2>
            <p>
              You can cancel your Pro subscription anytime from your account settings. When you
              cancel, you'll retain Pro access until the end of your current billing period.
              No partial refunds are issued for unused days within a billing cycle.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Promotional Pricing
            </h2>
            <p>
              If you signed up with a promotional discount, your
              discounted price remains active for as long as you stay subscribed. If you
              cancel and re-subscribe later, the standard price ($19/mo) will apply.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Exceptions
            </h2>
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li>Refunds after the 7-day window are at our discretion</li>
              <li>Accounts suspended for Terms of Service violations are not eligible for refunds</li>
              <li>Free-tier users have nothing to refund — it's free</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Contact
            </h2>
            <p>
              For refund requests or billing questions, email{" "}
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

export default Refund;
