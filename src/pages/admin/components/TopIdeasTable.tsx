import { TrendingUp, Eye, Bookmark } from "lucide-react";
import ExportButton from "./ExportButton";
import type { TopIdea } from "../types";

interface TopIdeasTableProps {
  ideas: TopIdea[];
}

const TopIdeasTable = ({ ideas }: TopIdeasTableProps) => {
  const exportData = ideas.map((idea, i) => ({
    rank: i + 1,
    title: idea.title,
    category: idea.category,
    score: idea.overall_score,
    views: idea.views_today,
    saves: idea.saves_today,
  }));

  return (
    <div className="surface-card p-3.5 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="font-heading text-sm sm:text-base font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <TrendingUp className="w-4 h-4" style={{ color: "#F59E0B" }} />
          Top Ideas
        </h2>
        <ExportButton data={exportData} filename="top-ideas" />
      </div>
      {ideas.length > 0 ? (
        <div className="space-y-2">
          {ideas.map((idea, i) => (
            <div
              key={idea.id}
              className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-white/[0.03] transition-colors"
            >
              <span
                className="font-heading text-xs font-bold w-5 text-center"
                style={{ color: i < 3 ? "#F59E0B" : "var(--text-tertiary)" }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className="font-body text-xs font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {idea.title}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {idea.category}
                  </span>
                  <span className="font-body text-[10px]" style={{ color: "#F59E0B" }}>
                    Score: {idea.overall_score}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-right flex-shrink-0">
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" style={{ color: "var(--text-tertiary)" }} />
                  <span
                    className="font-body text-[10px] tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {idea.views_today}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Bookmark className="w-3 h-3" style={{ color: "#10B981" }} />
                  <span className="font-body text-[10px] tabular-nums" style={{ color: "#10B981" }}>
                    {idea.saves_today}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="text-center py-8 font-body text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          No idea engagement for this period.
        </div>
      )}
    </div>
  );
};

export default TopIdeasTable;
