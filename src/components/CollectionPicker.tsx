import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, X } from "lucide-react";
import { useCollections } from "@/hooks/useCollections";
import { createPortal } from "react-dom";

interface CollectionPickerProps {
  open: boolean;
  onClose: () => void;
  ideaId: string;
}

const CollectionPicker = ({ open, onClose, ideaId }: CollectionPickerProps) => {
  const { collections, createCollection, addToCollection, removeFromCollection, getIdeaCollections } = useCollections();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !ideaId) return;
    setLoading(true);
    getIdeaCollections(ideaId).then((ids) => {
      setSelectedIds(new Set(ids));
      setLoading(false);
    });
  }, [open, ideaId, getIdeaCollections]);

  const toggle = async (collId: string) => {
    if (selectedIds.has(collId)) {
      await removeFromCollection(collId, ideaId);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(collId); return n; });
    } else {
      await addToCollection(collId, ideaId);
      setSelectedIds((prev) => new Set(prev).add(collId));
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const coll = await createCollection(newName.trim());
    if (coll) {
      await addToCollection(coll.id, ideaId);
      setSelectedIds((prev) => new Set(prev).add(coll.id));
    }
    setNewName("");
    setCreating(false);
  };

  const modalContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10002] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-xs rounded-2xl p-4"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Save to Collection
              </h3>
              <button onClick={onClose} className="p-1.5 rounded-md" style={{ color: "var(--text-tertiary)" }} aria-label="Close">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {loading ? (
              <div className="py-4 text-center">
                <p className="font-body text-xs" style={{ color: "var(--text-tertiary)" }}>Loading...</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {collections
                  .filter((c) => !c.is_default)
                  .map((coll) => (
                    <button
                      key={coll.id}
                      onClick={() => toggle(coll.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left"
                      style={{
                        background: selectedIds.has(coll.id) ? "rgba(124,106,237,0.08)" : "transparent",
                        border: selectedIds.has(coll.id) ? "1px solid rgba(124,106,237,0.2)" : "1px solid transparent",
                      }}
                    >
                      <span className="text-sm">{coll.emoji}</span>
                      <span className="font-body text-sm flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                        {coll.name}
                      </span>
                      {selectedIds.has(coll.id) && (
                        <Check className="w-4 h-4 shrink-0" style={{ color: "var(--accent-purple-light)" }} strokeWidth={2} />
                      )}
                    </button>
                  ))}
              </div>
            )}

            {/* New Collection */}
            {creating ? (
              <div className="flex gap-2 mt-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  className="flex-1 font-body text-sm rounded-lg px-3 py-1.5"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                  placeholder="Collection name"
                  autoFocus
                />
                <button onClick={handleCreate} className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold text-white" style={{ background: "var(--accent-purple)" }}>
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: "var(--text-tertiary)" }}
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                <span className="font-body text-sm">New Collection</span>
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default CollectionPicker;
