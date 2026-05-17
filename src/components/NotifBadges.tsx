import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUnreadCounts() {
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [missedCalls, setMissedCalls] = useState(0);

  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const [{ count: msgCount }, { count: callCount }] = await Promise.all([
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).is("seen_at", null),
        supabase.from("calls").select("id", { count: "exact", head: true }).eq("callee_id", user.id).eq("status", "missed"),
      ]);
      setUnreadMessages(msgCount ?? 0);
      setMissedCalls(callCount ?? 0);
    };
    refresh();
    const ch = supabase
      .channel(`badges-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `callee_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  return { unreadMessages, missedCalls, total: unreadMessages + missedCalls };
}

export function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white shadow">
      {count > 99 ? "99+" : count}
    </span>
  );
}
