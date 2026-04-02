import { useState, useEffect } from "react";
import { Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface Filters {
  search: string;
  topics: string[];
  budgets: string[];
  techLevels: string[];
  sizes: string[];
  minScore: number | null;
}

interface SearchFilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  resultCount: number;
  totalCount: number;
  userInterests?: string[];
}

const TOPIC_CATEGORIES = [
  "All",
  "AI / ML",
  "Developer Tools",
  "SaaS",
  "Marketing",
  "Sales",
  "Finance",
  "Healthcare",
  "Education",
  "E-commerce",
  "Productivity",
  "Analytics",
  "Security",
  "Social",
  "Real Estate",
  "HR",
  "Legal",
] as const;

const budgetOptions = [
  { label: "Zero", value: "zero" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const techOptions = [
  { label: "No-Code", value: "no_code" },
  { label: "Low-Code", value: "low_code" },
  { label: "Full-Stack", value: "full_stack" },
];

const sizeOptions = [
  { label: "⚡ Weekend", value: "small", color: "#34D399" },
  { label: "🛠️ Side Project", value: "medium", color: "#FBBF24" },
  { label: "🏗️ Serious Build", value: "large", color: "#FB923C" },
];

const scoreOptions = [
  { label: "7+", value: 7 },
  { label: "8+", value: 8 },
  { label: "9+", value: 9 },
];

const SearchFilterBar = ({ filters, onChange, resultCount, totalCount, userInterests }: SearchFilterBarProps) => {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onChange({ ...filters, search: localSearch });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, filters, onChange]);

  const toggleArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const hasActiveFilters = filters.search || filters.topics.length > 0 || filters.budgets.length > 0 || filters.techLevels.length > 0 || filters.sizes.length > 0 || filters.minScore !== null;
  const hasMoreFilters = filters.budgets.length > 0 || filters.techLevels.length > 0 || filters.sizes.length > 0 || filters.minScore !== null;

  const clearAll = () => {
    setLocalSearch("");
    onChange({ search: "", topics: [], budgets: [], techLevels: [], sizes: [], minScore: null });
  };

  const pillBase = "font-body text-[11px] sm:text-[11px] font-medium px-3 sm:px-3 py-2 sm:py-1.5 rounded-md transition-all duration-150 whitespace-nowrap shrink-0 min-h-[36px] sm:min-h-0 flex items-center";

  // Check if a topic should be highlighted as a user interest
  const isUserInterest = (topic: string) => {
    if (!userInterests || userInterests.length === 0) return false;
    const t = topic.toLowerCase();
    return userInterests.some(interest => {
      const i = interest.toLowerCase();
      // Fuzzy match: "SaaS / Software" matches "SaaS", "Developer Tools" matches "Developer Tools", etc.
      return i.includes(t) || t.includes(i) || i.split(/[\s\/]+/).some(word => t.includes(word));
    });
  };

  return (
    <div className="mb-5 space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder={`Search ${totalCount}+ ideas...`}
          className="font-body w-full rounded-xl py-2.5 pl-10 pr-10 text-xs sm:text-sm transition-all duration-250 focus:ring-2 focus:ring-[rgba(124,106,237,0.15)] focus:border-[rgba(124,106,237,0.35)]"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            outline: 'none',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.15)',
          }}
        />
        {localSearch && (
          <button onClick={() => { setLocalSearch(""); onChange({ ...filters, search: "" }); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Topic category pills */}
      <div className="relative">
      <div className="flex gap-1.5 items-center overflow-x-auto pb-1 scrollbar-hide flex-nowrap pr-6">
        {TOPIC_CATEGORIES.map((topic) => {
          const isAll = topic === "All";
          const isActive = isAll ? filters.topics.length === 0 : filters.topics.includes(topic);
          const isInterest = !isAll && isUserInterest(topic);

          return (
            <button
              key={topic}
              onClick={() => {
                if (isAll) {
                  onChange({ ...filters, topics: [] });
                } else {
                  onChange({ ...filters, topics: toggleArray(filters.topics, topic) });
                }
              }}
              className={`${pillBase} ${
                isActive
                  ? "text-[#EEEEF0] border border-[rgba(124,106,237,0.4)] bg-[rgba(124,106,237,0.15)]"
                  : "border border-transparent hover:border-[var(--border-hover)]"
              }`}
              style={!isActive ? {
                color: isInterest ? '#9585F2' : 'var(--text-tertiary)',
                ...(isInterest ? { borderColor: 'rgba(124,106,237,0.15)' } : {}),
              } : {}}
            >
              {topic}
            </button>
          );
        })}

        {/* More Filters toggle */}
        <button
          onClick={() => setShowMoreFilters(!showMoreFilters)}
          className={`${pillBase} flex items-center gap-1 ${
            hasMoreFilters
              ? "text-[#9585F2] border border-[rgba(124,106,237,0.3)] bg-[rgba(124,106,237,0.08)]"
              : "border border-transparent hover:border-[var(--border-hover)]"
          }`}
          style={!hasMoreFilters ? { color: 'var(--text-tertiary)' } : {}}
        >
          <SlidersHorizontal className="w-3 h-3" strokeWidth={1.5} />
          More
          <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showMoreFilters ? 'rotate-180' : ''}`} strokeWidth={1.5} />
        </button>

        {hasActiveFilters && (
          <button onClick={clearAll} className="font-body text-[11px] text-[#9585F2] hover:text-[var(--text-primary)] ml-1 transition-colors duration-150 whitespace-nowrap">
            Clear all
          </button>
        )}
      </div>
      {/* Fade hint on right edge */}
      <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-[var(--bg-base)] to-transparent pointer-events-none sm:hidden" />
      </div>

      {/* Collapsible More Filters */}
      <AnimatePresence>
        {showMoreFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex gap-1.5 items-center flex-wrap pt-1">
              <span className="font-body text-[10px] uppercase tracking-[0.06em] mr-1" style={{ color: 'var(--text-tertiary)' }}>Budget</span>
              {budgetOptions.map((b) => (
                <button key={b.value}
                  onClick={() => onChange({ ...filters, budgets: toggleArray(filters.budgets, b.value) })}
                  className={`${pillBase} ${filters.budgets.includes(b.value)
                    ? "text-[#EEEEF0] border border-[rgba(124,106,237,0.4)] bg-[rgba(124,106,237,0.15)]"
                    : "border border-transparent hover:border-[var(--border-hover)]"
                  }`}
                  style={!filters.budgets.includes(b.value) ? { color: 'var(--text-tertiary)' } : {}}>
                  ${b.label}
                </button>
              ))}

              <span className="w-px h-4 mx-1" style={{ background: 'var(--border-hover)' }} />

              <span className="font-body text-[10px] uppercase tracking-[0.06em] mr-1" style={{ color: 'var(--text-tertiary)' }}>Size</span>
              {sizeOptions.map((s) => (
                <button key={s.value}
                  onClick={() => onChange({ ...filters, sizes: toggleArray(filters.sizes, s.value) })}
                  className={`${pillBase} ${filters.sizes.includes(s.value)
                    ? "text-[#EEEEF0] border border-[rgba(124,106,237,0.4)] bg-[rgba(124,106,237,0.15)]"
                    : "border border-transparent hover:border-[var(--border-hover)]"
                  }`}
                  style={!filters.sizes.includes(s.value) ? { color: 'var(--text-tertiary)' } : {}}>
                  {s.label}
                </button>
              ))}

              <span className="w-px h-4 mx-1" style={{ background: 'var(--border-hover)' }} />

              <span className="font-body text-[10px] uppercase tracking-[0.06em] mr-1" style={{ color: 'var(--text-tertiary)' }}>Tech</span>
              {techOptions.map((t) => (
                <button key={t.value}
                  onClick={() => onChange({ ...filters, techLevels: toggleArray(filters.techLevels, t.value) })}
                  className={`${pillBase} ${filters.techLevels.includes(t.value)
                    ? "text-[#EEEEF0] border border-[rgba(124,106,237,0.4)] bg-[rgba(124,106,237,0.15)]"
                    : "border border-transparent hover:border-[var(--border-hover)]"
                  }`}
                  style={!filters.techLevels.includes(t.value) ? { color: 'var(--text-tertiary)' } : {}}>
                  {t.label}
                </button>
              ))}

              <span className="w-px h-4 mx-1" style={{ background: 'var(--border-hover)' }} />

              <span className="font-body text-[10px] uppercase tracking-[0.06em] mr-1" style={{ color: 'var(--text-tertiary)' }}>Score</span>
              {scoreOptions.map((s) => (
                <button key={s.value}
                  onClick={() => onChange({ ...filters, minScore: filters.minScore === s.value ? null : s.value })}
                  className={`${pillBase} ${filters.minScore === s.value
                    ? "text-[#EEEEF0] border border-[rgba(124,106,237,0.4)] bg-[rgba(124,106,237,0.15)]"
                    : "border border-transparent hover:border-[var(--border-hover)]"
                  }`}
                  style={filters.minScore !== s.value ? { color: 'var(--text-tertiary)' } : {}}>
                  {s.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasActiveFilters && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-body text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {resultCount} of {totalCount} ideas found
        </motion.p>
      )}
    </div>
  );
};

export default SearchFilterBar;
