import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

interface XPEvent {
  amount: number;
  id: number;
}

interface XPToastProps {
  events: XPEvent[];
}

const XPToast = ({ events }: XPToastProps) => {
  return createPortal(
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {events.map((event) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.6 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg"
            style={{
              background: "rgba(124, 106, 237, 0.15)",
              border: "1px solid rgba(124, 106, 237, 0.3)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <span className="text-sm">&#x26A1;</span>
            <span
              className="font-heading text-sm font-bold tabular-nums"
              style={{ color: "var(--accent-purple-light)" }}
            >
              +{event.amount} XP
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
};

export default XPToast;
