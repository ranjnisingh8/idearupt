import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import IdeaCard from "@/components/IdeaCard";
import IdeaDetail from "@/components/IdeaDetail";
import IdeaCardSkeleton from "@/components/IdeaCardSkeleton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Idea } from "@/data/ideas";
import { motion } from "framer-motion";
import { Bookmark, Plus, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { trackEvent, EVENTS } from "@/lib/analytics";
import { useCollections, Collection } from "@/hooks/useCollections";
import { toast } from "@/hooks/use-toast";
import { useAccess } from "@/hooks/useAccess";

const Saved = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [activeCollection, setActiveCollection] = useState<string | null>(null); // null = "All Saved"
  const { collections, createCollection, renameCollection, deleteCollection, updateEmoji, refetch } = useCollections();
  const { maxSavedTotal } = useAccess();

  // New collection inline
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCollName, setNewCollName] = useState("");

  // Collection menu
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchSaved = useCallback(async () => {
    if (!user) return;
    try {
      let ideaIds: string[] = [];

      if (activeCollection) {
        // Fetch from collection_items
        const { data: items } = await supabase
          .from("collection_items")
          .select("idea_id")
          .eq("collection_id", activeCollection);
        ideaIds = items?.map((d) => d.idea_id) ?? [];
      } else {
        // All saved
        const { data: interactions } = await supabase
          .from("user_interactions")
          .select("idea_id")
          .eq("user_id", user.id)
          .eq("action", "saved");
        ideaIds = interactions?.map((d) => d.idea_id) ?? [];
      }

      if (ideaIds.length === 0) {
        setIdeas([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("ideas")
        .select("*")
        .in("id", ideaIds)
        .order("created_at", { ascending: false });

      if (data) {
        const mapped = data.map((row: any) => ({
          ...row,
          oneLiner: row.oneLiner || row.one_liner || (() => { const d = row.description || ""; if (d.length <= 140) return d; const c = d.substring(0, 140); const s = c.lastIndexOf(" "); return s > 40 ? c.substring(0, s) + "..." : c + "..."; })(),
          category: row.category || "Other",
          tags: Array.isArray(row.tags) ? row.tags : [],
          scores: row.scores ?? {
            pain_score: row.pain_score ?? 0,
            trend_score: row.trend_score ?? 0,
            competition_score: row.competition_score ?? 0,
            revenue_potential: row.revenue_potential ?? 0,
            build_difficulty: row.build_difficulty ?? 0,
          },
          overall_score: row.overall_score ?? 0,
          save_count: row.save_count ?? 0,
          is_trending: row.is_trending ?? false,
          validation_data: row.validation_data ?? undefined,
        })) as Idea[];
        setIdeas(mapped);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [user, activeCollection]);

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    setLoading(true);
    fetchSaved();

    // Realtime
    const channel = supabase
      .channel('saved-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_interactions',
          filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (row?.action === 'saved') fetchSaved();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, navigate, fetchSaved]);

  const handleCreateCollection = async () => {
    if (!newCollName.trim()) return;
    const coll = await createCollection(newCollName.trim());
    if (coll) {
      toast({ title: `Collection "${coll.name}" created` });
    }
    setNewCollName("");
    setCreatingNew(false);
  };

  const handleRename = async (collId: string) => {
    if (!renameValue.trim()) return;
    await renameCollection(collId, renameValue.trim());
    toast({ title: "Collection renamed" });
    setRenaming(null);
  };

  const handleDelete = async (coll: Collection) => {
    if (coll.is_default) return;
    await deleteCollection(coll.id);
    if (activeCollection === coll.id) setActiveCollection(null);
    toast({ title: `"${coll.name}" deleted` });
  };

  const nonDefaultCollections = collections.filter((c) => !c.is_default);

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <div className="mx-auto px-4 py-6 max-w-3xl w-full">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-1 tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            Saved Ideas
          </h1>
          <p className="font-body text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
            Your bookmarked startup opportunities
            {maxSavedTotal !== Infinity && (
              <span className="ml-2 font-heading text-xs px-2 py-0.5 rounded-md" style={{ background: "var(--bg-elevated)", color: ideas.length >= maxSavedTotal ? "#F87171" : "var(--text-tertiary)" }}>
                {ideas.length} / {maxSavedTotal} saved
              </span>
            )}
          </p>

          {/* Collection Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
            {/* All Saved tab */}
            <button
              onClick={() => setActiveCollection(null)}
              className="shrink-0 px-3 py-1.5 rounded-lg font-body text-xs font-medium transition-all"
              style={{
                background: !activeCollection ? "rgba(124,106,237,0.12)" : "var(--bg-surface)",
                border: !activeCollection ? "1px solid rgba(124,106,237,0.3)" : "1px solid var(--border-subtle)",
                color: !activeCollection ? "var(--accent-purple-light)" : "var(--text-tertiary)",
              }}
            >
              {"\u{1F4BE}"} All Saved
            </button>

            {/* User collections */}
            {nonDefaultCollections.map((coll) => (
              <div key={coll.id} className="relative shrink-0 flex items-center">
                {renaming === coll.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(coll.id); if (e.key === "Escape") setRenaming(null); }}
                      className="font-body text-xs rounded-lg px-2 py-1 w-24"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                      autoFocus
                    />
                    <button onClick={() => handleRename(coll.id)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "var(--accent-purple-light)" }}>Save</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveCollection(coll.id)}
                    className="px-3 py-1.5 rounded-lg font-body text-xs font-medium transition-all"
                    style={{
                      background: activeCollection === coll.id ? "rgba(124,106,237,0.12)" : "var(--bg-surface)",
                      border: activeCollection === coll.id ? "1px solid rgba(124,106,237,0.3)" : "1px solid var(--border-subtle)",
                      color: activeCollection === coll.id ? "var(--accent-purple-light)" : "var(--text-tertiary)",
                    }}
                  >
                    {coll.emoji} {coll.name}
                    <span className="ml-1 opacity-60">{coll.item_count}</span>
                  </button>
                )}

                {/* 3-dot menu */}
                {activeCollection === coll.id && !coll.is_default && (
                  <div className="relative ml-1">
                    <button
                      onClick={() => setMenuOpen(menuOpen === coll.id ? null : coll.id)}
                      className="p-1 rounded-md hover:bg-[rgba(255,255,255,0.04)]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    {menuOpen === coll.id && (
                      <div className="absolute top-full right-0 mt-1 py-1 rounded-lg shadow-lg z-20 min-w-[120px]" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                        <button
                          onClick={() => { setRenaming(coll.id); setRenameValue(coll.name); setMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-body hover:bg-[rgba(255,255,255,0.04)]"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <Pencil className="w-3 h-3" strokeWidth={1.5} /> Rename
                        </button>
                        <button
                          onClick={() => { handleDelete(coll); setMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-body hover:bg-[rgba(255,255,255,0.04)]"
                          style={{ color: "#ef4444" }}
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.5} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Add collection button */}
            {creatingNew ? (
              <div className="shrink-0 flex items-center gap-1">
                <input
                  value={newCollName}
                  onChange={(e) => setNewCollName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateCollection(); if (e.key === "Escape") setCreatingNew(false); }}
                  className="font-body text-xs rounded-lg px-2 py-1 w-24"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                  placeholder="Name"
                  autoFocus
                />
                <button onClick={handleCreateCollection} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "var(--accent-purple-light)" }}>Add</button>
                <button onClick={() => setCreatingNew(false)} className="p-0.5" style={{ color: "var(--text-tertiary)" }}>
                  <X className="w-3 h-3" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreatingNew(true)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-body text-xs font-medium transition-all hover:bg-[rgba(255,255,255,0.04)]"
                style={{ border: "1px dashed var(--border-subtle)", color: "var(--text-tertiary)" }}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> New
              </button>
            )}
          </div>

          {/* Ideas list */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <IdeaCardSkeleton key={i} />
              ))}
            </div>
          ) : ideas.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="w-10 h-10" strokeWidth={1.5} />}
              title={activeCollection ? "No ideas in this collection" : "No saved ideas yet"}
              description={activeCollection ? "Save ideas from the feed and organize them here." : "Browse the feed and save ideas you want to explore later."}
              action={{ label: "Browse Ideas", to: "/feed" }}
            />
          ) : (
            <div className="space-y-4">
              {ideas.map((idea, i) => (
                <IdeaCard key={idea.id} idea={idea} index={i} onClick={() => {
                  setSelectedIdea(idea);
                  trackEvent(EVENTS.SAVED_IDEA_OPENED, { idea_id: idea.id, idea_title: idea.title });
                }} />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {selectedIdea && createPortal(
        <IdeaDetail idea={selectedIdea} onClose={() => setSelectedIdea(null)} />,
        document.body
      )}
    </div>
  );
};

export default Saved;
