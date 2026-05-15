import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtDuration, initials, timeAgo } from "@/lib/medux";
import { Phone, Video, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";

export const Route = createFileRoute("/_app/calls")({
  head: () => ({ meta: [{ title: "Call history — Medux" }] }),
  component: CallLogs,
});

interface CallRow { id: string; type: string; status: string; started_at: string; duration_seconds: number | null; initiator_id: string; callee_id: string; }
interface Profile { id: string; full_name: string | null; avatar_url: string | null; }

function CallLogs() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState<"all" | "incoming" | "outgoing" | "missed">("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("calls").select("*").or(`initiator_id.eq.${user.id},callee_id.eq.${user.id}`).order("started_at", { ascending: false }).limit(100);
      const list = (data as CallRow[]) || [];
      setCalls(list);
      const ids = new Set<string>();
      list.forEach((c) => { ids.add(c.initiator_id); ids.add(c.callee_id); });
      ids.delete(user.id);
      if (ids.size) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", Array.from(ids));
        const map: Record<string, Profile> = {};
        (ps as Profile[] | null)?.forEach((p) => (map[p.id] = p));
        setProfiles(map);
      }
    })();
  }, [user]);

  if (!user) return null;
  const filtered = calls.filter((c) => {
    if (filter === "all") return true;
    if (filter === "incoming") return c.callee_id === user.id && c.status !== "missed";
    if (filter === "outgoing") return c.initiator_id === user.id;
    if (filter === "missed") return c.status === "missed";
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-['Space_Grotesk'] text-3xl font-bold">Call history</h1>
        <p className="mt-1 text-muted-foreground">Every call you've made or received.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "incoming", "outgoing", "missed"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition ${filter === f ? "gradient-brand text-white shadow-glow" : "glass hover:scale-105"}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="rounded-2xl glass shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">No calls match this filter.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c) => {
              const otherId = c.initiator_id === user.id ? c.callee_id : c.initiator_id;
              const p = profiles[otherId];
              const outgoing = c.initiator_id === user.id;
              const Icon = c.status === "missed" ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
              const color = c.status === "missed" ? "text-destructive" : "text-primary";
              return (
                <li key={c.id} className="flex items-center gap-4 p-4 hover:bg-accent/30 transition">
                  <div className="grid h-10 w-10 place-items-center rounded-full gradient-brand text-sm font-semibold text-white">
                    {p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(p?.full_name)}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p?.full_name || "Unknown"}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className={`h-3 w-3 ${color}`} />
                      {c.type === "video" ? <Video className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                      <span className="capitalize">{c.status}</span>
                      · {timeAgo(c.started_at)}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground">{fmtDuration(c.duration_seconds || 0)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
