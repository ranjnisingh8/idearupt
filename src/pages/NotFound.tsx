import { Link } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";


const NotFound = () => {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>

      <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 64px)" }}>
        <div className="text-center px-4 max-w-md">
          {/* Big 404 */}
          <div
            className="font-heading text-[120px] sm:text-[160px] font-bold leading-none mb-2 select-none"
            style={{
              background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              opacity: 0.25,
            }}
          >
            404
          </div>

          <h1
            className="font-heading text-xl sm:text-2xl font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Page not found
          </h1>
          <p
            className="font-body text-sm sm:text-base mb-8 leading-relaxed"
            style={{ color: "var(--text-tertiary)" }}
          >
            The page you're looking for doesn't exist or has been moved.
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.history.back()}
              className="surface-card px-4 py-2.5 flex items-center gap-2 text-sm font-body font-medium hover:opacity-80 transition-opacity rounded-xl"
              style={{ color: "var(--text-secondary)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
            <Link
              to="/"
              className="btn-gradient px-5 py-2.5 text-sm font-heading font-medium inline-flex items-center gap-2 rounded-xl"
            >
              <Home className="w-4 h-4" />
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
