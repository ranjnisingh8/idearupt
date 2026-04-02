import { Link, useLocation } from "react-router-dom";

const Footer = () => {
  const location = useLocation();

  // Hide footer on landing page (it has its own footer) and onboarding/auth
  const hiddenRoutes = ["/", "/auth", "/onboarding", "/quiz"];
  if (hiddenRoutes.includes(location.pathname)) return null;

  return (
    <footer style={{ borderTop: "1px solid var(--border-subtle)" }} className="py-8 mt-auto">
      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-body"
        style={{ color: "var(--text-tertiary)" }}
      >
        <span
          className="font-heading font-semibold tracking-tight text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Idearupt
        </span>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <Link to="/pricing" className="hover:text-[var(--text-secondary)] transition-colors">
            Pricing
          </Link>
          <Link to="/changelog" className="hover:text-[var(--text-secondary)] transition-colors">
            Changelog
          </Link>
          <Link to="/privacy" className="hover:text-[var(--text-secondary)] transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-[var(--text-secondary)] transition-colors">
            Terms
          </Link>
          <Link to="/refund" className="hover:text-[var(--text-secondary)] transition-colors">
            Refund
          </Link>
          <a
            href="https://x.com/idearupt"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text-secondary)] transition-colors"
          >
            Twitter
          </a>
          <a
            href="mailto:hello@idearupt.ai"
            className="hover:text-[var(--text-secondary)] transition-colors"
          >
            hello@idearupt.ai
          </a>
        </div>

        <span className="text-center">
          &copy; {new Date().getFullYear()} Idearupt. All rights reserved.
        </span>
      </div>
    </footer>
  );
};

export default Footer;
