import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { SimilarIdea } from "@/hooks/useIdeaValidation";
import { PLATFORM_STATS } from "@/lib/config";

interface Props {
  ideas: SimilarIdea[];
}

const SimilarIdeas = ({ ideas }: Props) => {
  const navigate = useNavigate();

  if (!ideas || ideas.length === 0) {
    return (
      <section className="mb-6">
        <div className="mb-4">
          <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            🔍 Similar Ideas Already Validated
          </h4>
        </div>
        <div className="surface-card rounded-xl p-6 text-center" style={{ transform: "none" }}>
          <p className="font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
            Your idea appears unique — we haven't found anything like this in our database of {PLATFORM_STATS.problemsFound}+ validated opportunities 🦄
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <h4 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          🔍 Similar Ideas Already Validated
        </h4>
        <span
          className="font-body text-[11px] px-2 py-0.5 rounded-md"
          style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#A78BFA" }}
        >
          {ideas.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ideas.map((idea, i) => (
          <motion.div
            key={idea.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i }}
            className="surface-card rounded-xl p-4 cursor-pointer"
            onClick={() => navigate("/feed", { state: { openIdeaId: idea.id } })}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="font-heading text-lg font-bold tabular-nums"
                style={{
                  color:
                    idea.overall_score >= 8 ? "#10B981" : idea.overall_score >= 6 ? "#F59E0B" : "#EF4444",
                }}
              >
                {idea.overall_score}
              </span>
              <span
                className="font-body text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.15)", color: "#A78BFA" }}
              >
                {idea.category}
              </span>
            </div>
            <h5 className="font-heading text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {idea.title}
            </h5>
            <p className="font-body text-xs line-clamp-2" style={{ color: "var(--text-tertiary)" }}>
              {idea.one_liner}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default SimilarIdeas;
