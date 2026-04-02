import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  is_default: boolean;
  sort_order: number;
  item_count: number;
}

export const useCollections = () => {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCollections = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data: colls } = await supabase
      .from("collections")
      .select("id, name, emoji, is_default, sort_order")
      .eq("user_id", user.id)
      .order("sort_order");

    if (!colls) { setLoading(false); return; }

    // Fetch item counts
    const collsWithCounts: Collection[] = await Promise.all(
      colls.map(async (c) => {
        const { count } = await supabase
          .from("collection_items")
          .select("id", { count: "exact", head: true })
          .eq("collection_id", c.id);
        return { ...c, item_count: count ?? 0 };
      })
    );

    setCollections(collsWithCounts);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  const createCollection = useCallback(async (name: string, emoji = "\u{1F4C1}") => {
    if (!user) return null;
    const maxOrder = collections.reduce((max, c) => Math.max(max, c.sort_order), 0);
    const { data, error } = await supabase
      .from("collections")
      .insert({ user_id: user.id, name, emoji, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error || !data) return null;
    const newColl: Collection = { ...data, item_count: 0 };
    setCollections((prev) => [...prev, newColl]);
    return newColl;
  }, [user, collections]);

  const renameCollection = useCallback(async (collId: string, name: string) => {
    await supabase.from("collections").update({ name }).eq("id", collId);
    setCollections((prev) => prev.map((c) => c.id === collId ? { ...c, name } : c));
  }, []);

  const updateEmoji = useCallback(async (collId: string, emoji: string) => {
    await supabase.from("collections").update({ emoji }).eq("id", collId);
    setCollections((prev) => prev.map((c) => c.id === collId ? { ...c, emoji } : c));
  }, []);

  const deleteCollection = useCallback(async (collId: string) => {
    await supabase.from("collections").delete().eq("id", collId);
    setCollections((prev) => prev.filter((c) => c.id !== collId));
  }, []);

  const addToCollection = useCallback(async (collId: string, ideaId: string) => {
    const { error } = await supabase
      .from("collection_items")
      .insert({ collection_id: collId, idea_id: ideaId });
    if (!error) {
      setCollections((prev) => prev.map((c) =>
        c.id === collId ? { ...c, item_count: c.item_count + 1 } : c
      ));
    }
    return !error;
  }, []);

  const removeFromCollection = useCallback(async (collId: string, ideaId: string) => {
    await supabase
      .from("collection_items")
      .delete()
      .eq("collection_id", collId)
      .eq("idea_id", ideaId);
    setCollections((prev) => prev.map((c) =>
      c.id === collId ? { ...c, item_count: Math.max(0, c.item_count - 1) } : c
    ));
  }, []);

  const getIdeaCollections = useCallback(async (ideaId: string) => {
    if (!user) return [];
    const { data } = await supabase
      .from("collection_items")
      .select("collection_id")
      .eq("idea_id", ideaId);
    return data?.map((d) => d.collection_id) ?? [];
  }, [user]);

  return {
    collections,
    loading,
    createCollection,
    renameCollection,
    updateEmoji,
    deleteCollection,
    addToCollection,
    removeFromCollection,
    getIdeaCollections,
    refetch: fetchCollections,
  };
};
