import { format, formatDistanceToNow } from "date-fns";
import { getEventDisplay } from "../constants";
import type { ActiveUser } from "../types";

interface ActiveUsersPanelProps {
  activeUsers: ActiveUser[];
  onUserClick?: (userId: string, email: string | null) => void;
}

const ActiveUsersPanel = ({ activeUsers, onUserClick }: ActiveUsersPanelProps) => (
  <div className="surface-card p-3.5 sm:p-4">
    <div className="flex items-center gap-2 mb-3">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <h3
        className="font-heading text-sm font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        Active Now
      </h3>
      <span
        className="font-body text-[10px] px-2 py-0.5 rounded-full"
        style={{ background: "rgba(16,185,129,0.15)", color: "#10B981" }}
      >
        {activeUsers.length} {activeUsers.length === 1 ? "user" : "users"}
      </span>
    </div>
    {activeUsers.length === 0 ? (
      <div
        className="text-center py-6 font-body text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        No active users right now.
      </div>
    ) : (
      <div className="space-y-1 max-h-[240px] overflow-y-auto scrollbar-thin">
        {activeUsers.map((user) => {
          const display = getEventDisplay(user.last_event);
          let lastSeenLabel = "";
          try {
            lastSeenLabel = formatDistanceToNow(new Date(user.last_seen), { addSuffix: true });
          } catch { /* ignore */ }
          return (
            <div
              key={user.user_id || user.user_email || Math.random()}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-white/[0.03] cursor-pointer transition-colors"
              onClick={() => {
                if (user.user_id && onUserClick) onUserClick(user.user_id, user.user_email);
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #10B981, #06B6D4)", color: "white" }}
              >
                {(user.user_email || "A")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="font-body text-xs truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {user.user_email || (user.user_id ? `User ${user.user_id.substring(0, 8)}` : "Anonymous")}
                </div>
                <div className="font-body text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  {display.label} {"\u00B7"} {lastSeenLabel}
                </div>
              </div>
              <span
                className="font-body text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: "rgba(16,185,129,0.1)", color: "#10B981" }}
              >
                {user.event_count} events
              </span>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default ActiveUsersPanel;
