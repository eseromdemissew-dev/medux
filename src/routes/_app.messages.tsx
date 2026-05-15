import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { initials, timeAgo } from "@/lib/medux";
import { Send, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_app/messages")({
  head: () => ({ meta: [{ title: "Messages — Medux" }] }),
  component: Messages,
});

interface Profile { id: string; full_name: string | null; avatar_url: string | null; }
interface Msg { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; }

function Messages() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: cs } = await supabase.from("contacts").select("user_id, contact_id, status").eq("status", "accepted").or(`user_id.eq.${user.id},contact_id.eq.${user.id}`);
      const ids = Array.from(new Set((cs || []).map((c) => (c.user_id === user.id ? c.contact_id : c.user_id))));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
        setContacts((ps as Profile[]) || []);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !activeId) return;
    (async () => {
      const { data } = await supabase.from("messages").select("*")
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${activeId}),and(sender_id.eq.${activeId},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: true }).limit(100);
      setMessages((data as Msg[]) || []);
    })();
    const ch = supabase.channel(`msg-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Msg;
        if ((m.sender_id === user.id && m.recipient_id === activeId) || (m.sender_id === activeId && m.recipient_id === user.id)) {
          setMessages((prev) => [...prev, m]);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, activeId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user || !activeId) return;
    const content = text.trim();
    setText("");
    await supabase.from("messages").insert({ sender_id: user.id, recipient_id: activeId, content });
  }

  if (!user) return null;
  const active = contacts.find((c) => c.id === activeId);

  return (
    <div className="grid h-[calc(100vh-9rem)] gap-4 lg:grid-cols-[280px_1fr]">
      <div className="rounded-2xl glass p-3 shadow-card overflow-y-auto">
        <h2 className="px-2 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conversations</h2>
        {contacts.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Add friends to start chatting.</p>
        ) : (
          <ul className="space-y-1">
            {contacts.map((c) => (
              <li key={c.id}>
                <button onClick={() => setActiveId(c.id)} className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${activeId === c.id ? "gradient-brand text-white" : "hover:bg-accent/50"}`}>
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-xs font-semibold">{initials(c.full_name)}</div>
                  <div className="truncate text-sm font-medium">{c.full_name}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col rounded-2xl glass shadow-card overflow-hidden">
        {!active ? (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">Pick a conversation to start chatting.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="grid h-10 w-10 place-items-center rounded-full gradient-brand text-sm font-semibold text-white">{initials(active.full_name)}</div>
              <div className="font-semibold">{active.full_name}</div>
            </div>
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === user.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${m.sender_id === user.id ? "gradient-brand text-white" : "glass"}`}>
                    {m.content}
                    <div className="mt-1 text-[10px] opacity-60">{timeAgo(m.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
                className="flex-1 rounded-xl bg-input/50 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
              <button className="grid h-10 w-10 place-items-center rounded-xl gradient-brand text-white shadow-glow hover:scale-105 transition">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
