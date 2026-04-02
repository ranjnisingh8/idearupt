import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import { getEventDisplay } from "../constants";
import ExportButton from "./ExportButton";
import type { LiveEvent } from "../types";

const formatTimestamp = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return {
      absolute: format(d, "h:mm a"),
      relative: formatDistanceToNow(d, { addSuffix: true }),
    };
  } catch {
    return { absolute: "", relative: "" };
  }
};

const getEventDetail = (evt: LiveEvent): string => {
  const data = evt.event_data;
  if (evt.event_name === "page_view" && evt.page_url) return evt.page_url;
  if (evt.event_name === "time_on_page" && data?.duration_seconds)
    return `${data.duration_seconds}s on ${data.page || evt.page_url || "page"}`;
  if (evt.event_name === "idea_viewed" && data?.idea_title) return data.idea_title;
  if (evt.event_name === "idea_saved" && data?.idea_title) return data.idea_title;
  if (evt.event_name === "idea_shared" && data?.platform) return `via ${data.platform}`;
  if (evt.event_name === "signup_completed" && data?.provider) return `via ${data.provider}`;
  if (evt.event_name === "validation_started" && data?.text_length) return `${data.text_length} chars`;
  if (evt.event_name === "validation_completed" && data?.text_length) return `${data.text_length} chars`;
  if (evt.event_name === "cta_hero_click" && data?.label) return data.label;
  if (evt.event_name === "cta_get_started" && data?.location) return `from ${data.location}`;
  if (evt.event_name === "cta_claim_pro" && data?.source) return `from ${data.source}`;
  if (evt.page_url) return evt.page_url;
  return "";
};

interface LiveActivityFeedProps {
  events: LiveEvent[];
  isLive: boolean;
  onUserClick?: (userId: string, email: string | null) => void;
}

const LiveActivityFeed = ({ events, isLive, onUserClick }: LiveActivityFeedProps) => {
  const feedRef = useRef<HTMLDivElement>(null);

  const exportData = events.map((e) => ({
    time: e.created_at,
    event: e.event_name,
    user: e.user_email || e.user_id || "Anonymous",
    page: e.page_url || "",
    detail: getEventDetail(e),
  }));

  return (
    <div className="surface-card p-3.5 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLive && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          <h2
            className="font-heading text-sm sm:text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {isLive ? "Live Activity" : "Activity"}
          </h2>
          <span
            className="font-body text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}
          >
            {events.length} events
          </span>
        </div>
        <ExportButton data={exportData} filename="activity-feed" />
      </div>
      <div
        ref={feedRef}
        className="space-y-0.5 max-h-[400px] sm:max-h-[480px] overflow-y-auto pr-1 scrollbar-thin"
        style={{ scrollbarColor: "var(--border-subtle) transparent" }}
      >
        <AnimatePresence initial={false}>
          {events.length === 0 ? (
            <div
              className="text-center py-12 font-body text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              No events for this period.
            </div>
          ) : (
            events.map((evt) => {
              const display = getEventDisplay(evt.event_name);
              const detail = getEventDetail(evt);
              const ts = formatTimestamp(evt.created_at);
              return (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-sm flex-shrink-0 mt-0.5">{display.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="font-body text-xs font-medium" style={{ color: display.color }}>
                        {display.label}
                      </span>
                      {detail && (
                        <span
                          className="font-body text-[10px] sm:text-[11px] truncate max-w-[200px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {detail}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="font-body text-[10px] cursor-pointer hover:underline"
                        style={{ color: "var(--text-tertiary)" }}
                        onClick={() => {
                          if (evt.user_id && onUserClick) onUserClick(evt.user_id, evt.user_email);
                        }}
                      >
                        {evt.user_email ||
                          (evt.user_id ? evt.user_id.substring(0, 8) + "..." : "Anonymous")}
                      </span>
                      <span className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                        {"\u00B7"} {ts.absolute} {"\u00B7"} {ts.relative}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LiveActivityFeed;
