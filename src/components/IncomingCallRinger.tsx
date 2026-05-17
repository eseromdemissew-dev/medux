import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Ringtone, initials } from "@/lib/medux";

interface IncomingCall {
  id: string;
  type: string;
  initiator_id: string;
  is_group: boolean;
  caller?: { full_name: string | null; avatar_url: string | null };
}

export function IncomingCallRinger() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const ringRef = useRef<Ringtone | null>(null);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`global-incoming-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${user.id}` }, async (payload) => {
        const c = payload.new as IncomingCall;
        if ((c as unknown as { status: string }).status !== "ringing") return;
        const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", c.initiator_id).maybeSingle();
        setIncoming({ ...c, caller: p ?? undefined });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); ringRef.current?.stop(); };
  }, [user]);

  useEffect(() => {
    if (incoming) {
      const r = new Ringtone();
      ringRef.current = r;
      r.start();
      // Also fire browser notification if permission was granted
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try { new Notification("Medux call", { body: `${incoming.caller?.full_name ?? "Someone"} is calling`, tag: `call-${incoming.id}` }); } catch { /* noop */ }
      }
    } else {
      ringRef.current?.stop();
    }
    return () => { ringRef.current?.stop(); };
  }, [incoming]);

  async function accept() {
    if (!incoming) return;
    ringRef.current?.stop();
    const id = incoming.id;
    setIncoming(null);
    nav({ to: "/call/$callId", params: { callId: id } });
  }

  async function decline() {
    if (!incoming) return;
    ringRef.current?.stop();
    await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", incoming.id);
    setIncoming(null);
  }

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
          className="fixed top-4 right-4 z-[100] flex items-center gap-3 rounded-2xl glass px-4 py-3 shadow-glow"
        >
          <div className="relative h-12 w-12 shrink-0">
            <div className="ring-wave absolute inset-0 rounded-full" />
            <div className="grid h-full w-full place-items-center rounded-full gradient-brand text-sm font-semibold text-white">
              {incoming.caller?.avatar_url ? <img src={incoming.caller.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(incoming.caller?.full_name)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{incoming.caller?.full_name || "Unknown"}</div>
            <div className="text-xs text-muted-foreground">Incoming {incoming.type} call…</div>
          </div>
          <button onClick={decline} aria-label="Decline" className="grid h-10 w-10 place-items-center rounded-full bg-destructive text-white hover:scale-110 transition">
            <PhoneOff className="h-4 w-4" />
          </button>
          <button onClick={accept} aria-label="Accept" className="grid h-10 w-10 place-items-center rounded-full bg-success text-white hover:scale-110 transition">
            <Phone className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
