import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getEventDisplay } from "../constants";
import type { UserJourneyEvent } from "../types";

interface UserJourneyDialogProps {
  userId: string | null;
  userEmail: string | null;
  onClose: () => void;
}

const UserJourneyDialog = ({ userId, userEmail, onClose }: UserJourneyDialogProps) => {
  const [events, setEvents] = useState<UserJourneyEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.resolve(
      supabase
        .rpc("admin_get_user_journey", { target_user_id: userId })
        .then(({ data }) => {
          if (data) setEvents(data);
          setLoading(false);
        })
    ).catch(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div
        className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div>
            <h2 className="font-heading text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              User Journey
            </h2>
            <p className="font-body text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {userEmail || `User ${userId.substring(0, 12)}...`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-5">
          {loading ? (
            <div className="text-center py-12 font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
              Loading user journey...
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 font-body text-sm" style={{ color: "var(--text-tertiary)" }}>
              No events found for this user in the last 7 days.
            </div>
          ) : (
            <div className="space-y-0.5">
              {events.map((evt, i) => {
                const display = getEventDisplay(evt.event_name);
                let timeStr = "";
                let relStr = "";
                try {
                  const d = new Date(evt.created_at);
                  timeStr = format(d, "MMM d, h:mm:ss a");
                  relStr = formatDistanceToNow(d, { addSuffix: true });
                } catch {}
                return (
                  <div
                    key={evt.id}
                    className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className="text-sm">{display.icon}</span>
                      {i < events.length - 1 && (
                        <div
                          className="w-px flex-1 mt-1 min-h-[16px]"
                          style={{ background: "var(--border-subtle)" }}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <span className="font-body text-xs font-medium" style={{ color: display.color }}>
                        {display.label}
                      </span>
                      {evt.page_url && (
                        <span
                          className="font-body text-[10px] ml-2 truncate"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {evt.page_url}
                        </span>
                      )}
                      <div className="font-body text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                        {timeStr} {"\u00B7"} {relStr}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserJourneyDialog;
