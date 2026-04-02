import { Link, useLocation } from "react-router-dom";
import { Zap, Menu, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Navbar = () => {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const rafRef = useRef<number>(0);

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setScrolled(window.scrollY > 20);
    });
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onScroll]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const LogoText = () => (
    <span className="font-heading text-xl font-bold tracking-tight">
      Idea<span className="text-gradient-purple-cyan">rupt</span>
    </span>
  );

  const isGlass = scrolled || !isLanding;

  return (
    <nav
      className={`sticky top-0 z-50 ${
        isGlass
          ? "glass sm:mx-4 mt-1 sm:mt-2 rounded-xl sm:rounded-2xl border border-[var(--border-subtle)]"
          : "bg-transparent border-b border-transparent"
      }`}
      style={{
        ...(isGlass ? { boxShadow: "var(--shadow-lg)" } : {}),
        /* Only transition visual props — NEVER layout props like margin/padding */
        transition:
          "background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
      }}
    >
      {/* Subtle accent line at bottom */}
      {isGlass && (
        <div
          className="absolute bottom-0 left-[10%] right-[10%] h-[1px] rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(124,106,237,0.15), transparent)",
          }}
        />
      )}

      {/* Main nav bar — always 60px height */}
      <div className="container mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 haptic-press">
          <motion.div
            whileHover={{ rotate: 10 }}
            whileTap={{ scale: 0.9 }}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "#7C6AED" }}
          >
            <Zap className="w-4 h-4 text-white" strokeWidth={1.5} />
          </motion.div>
          <LogoText />
        </Link>

        {/* Desktop landing links */}
        <div className="hidden md:flex items-center gap-8">
          <a
            href="#how-it-works"
            className="font-heading text-[13px] font-medium tracking-[0.01em] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            How it works
          </a>
          <Link
            to="/pricing"
            className="font-heading text-[13px] font-medium tracking-[0.01em] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            Pricing
          </Link>
          <a
            href="#faq"
            className="font-heading text-[13px] font-medium tracking-[0.01em] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors duration-150"
          >
            FAQ
          </a>
        </div>

        {/* Desktop CTA buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            to="/auth?mode=login"
            className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-4 py-2"
          >
            Log in
          </Link>
          <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
            Start Free Trial &rarr;
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen((prev) => !prev)}
          className="sm:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center haptic-press"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          <AnimatePresence mode="wait" initial={false}>
            {mobileOpen ? (
              <motion.span
                key="close"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: 0.15 }}
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </motion.span>
            ) : (
              <motion.span
                key="menu"
                initial={{ opacity: 0, rotate: 90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: -90 }}
                transition={{ duration: 0.15 }}
              >
                <Menu className="w-5 h-5" strokeWidth={1.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Mobile menu dropdown — with smooth enter/exit */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="sm:hidden overflow-hidden border-t border-[var(--border-subtle)]"
            style={{
              background: "rgba(6, 7, 11, 0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            <div className="px-4 py-3 space-y-0.5">
              <a
                href="#how-it-works"
                onClick={() => setMobileOpen(false)}
                className="font-heading text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-3 min-h-[44px] flex items-center"
              >
                How it works
              </a>
              <Link
                to="/pricing"
                onClick={() => setMobileOpen(false)}
                className="font-heading text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-3 min-h-[44px] flex items-center"
              >
                Pricing
              </Link>
              <a
                href="#faq"
                onClick={() => setMobileOpen(false)}
                className="font-heading text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-3 min-h-[44px] flex items-center"
              >
                FAQ
              </a>
              <Link
                to="/auth?mode=login"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-[var(--text-secondary)] py-3 min-h-[44px] flex items-center"
              >
                Log in
              </Link>
              <Link
                to="/auth"
                onClick={() => setMobileOpen(false)}
                className="btn-gradient px-4 py-3.5 text-center text-sm mt-2 min-h-[44px] flex items-center justify-center"
              >
                Start Free Trial &rarr;
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
