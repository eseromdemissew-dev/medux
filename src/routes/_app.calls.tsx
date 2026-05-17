import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtDuration, initials, timeAgo } from "@/lib/medux";
import { startDirectCall, startGroupCall } from "@/lib/calls.functions";
import { Phone, Video, PhoneIncoming, PhoneMissed, PhoneOutgoing, Users as UsersIcon } from "lucide-react";

export const Route = createFileRoute("/_app/calls")({
  head: () => ({ meta: [{ title: "Call history — Medux" }] }),
  component: CallLogs,
});

interface CallRow { id: string; type: string; status: string; started_at: string; duration_seconds: number | null; initiator_id: string; callee_id: string | null; is_group: boolean; }
interface Profile { id: string; full_name: string | null; avatar_url: string | null; online_status?: string }

function CallLogs() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState<"all" | "incoming" | "outgoing" | "missed">("all");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("calls").select("*").or(`initiator_id.eq.${user.id},callee_id.eq.${user.id}`).order("started_at", { ascending: false }).limit(100);
      const list = (data as CallRow[]) || [];
      setCalls(list);
      const ids = new Set<string>();
      list.forEach((c) => { ids.add(c.initiator_id); if (c.callee_id) ids.add(c.callee_id); });
      ids.delete(user.id);
      if (ids.size) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, avatar_url, online_status").in("id", Array.from(ids));
        const map: Record<string, Profile> = {};
        (ps as Profile[] | null)?.forEach((p) => (map[p.id] = p));
        setProfiles(map);
      }
    })();
  }, [user]);

  async function recall(peerId: string, type: "video" | "audio" = "video") {
    if (busy) return;
    setBusy(true);
    try {
      const { call } = await startDirectCall({ data: { calleeId: peerId, type } });
      nav({ to: "/call/$callId", params: { callId: call.id } });
    } catch (e) {
      toast.error((e as Error).message || "Failed to start call");
    } finally { setBusy(false); }
  }

  async function newGroup() {
    if (busy) return;
    setBusy(true);
    try {
      const { call } = await startGroupCall({ data: { type: "video", inviteUserIds: [] } });
      nav({ to: "/call/$callId", params: { callId: call.id } });
    } catch (e) {
      toast.error((e as Error).message || "Failed to start group call");
    } finally { setBusy(false); }
  }

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-['Space_Grotesk'] text-3xl font-bold">Call history</h1>
          <p className="mt-1 text-muted-foreground">Tap any past call to ring that person again.</p>
        </div>
        <button onClick={newGroup} disabled={busy} className="flex items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow hover:scale-105 transition disabled:opacity-50">
          <UsersIcon className="h-4 w-4" /> Start group call
        </button>
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
              const p = otherId ? profiles[otherId] : undefined;
              const outgoing = c.initiator_id === user.id;
              const Icon = c.status === "missed" ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
              const color = c.status === "missed" ? "text-destructive" : "text-primary";
              const canRecall = !!otherId && !c.is_group;
              return (
                <li key={c.id} className="group flex items-center gap-4 p-4 hover:bg-accent/30 transition">
                  <button onClick={() => canRecall && recall(otherId!, c.type === "audio" ? "audio" : "video")}
                    disabled={!canRecall || busy} title={canRecall ? "Call back" : ""}
                    className="flex flex-1 items-center gap-4 text-left disabled:cursor-default">
                    <div className="relative grid h-10 w-10 place-items-center rounded-full gradient-brand text-sm font-semibold text-white">
                      {c.is_group ? <UsersIcon className="h-5 w-5" /> : p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(p?.full_name)}
                      {p?.online_status === "online" && <span className="absolute -bottom-0 -right-0 h-3 w-3 rounded-full bg-success ring-2 ring-background" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.is_group ? "Group call" : p?.full_name || "Unknown"}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className={`h-3 w-3 ${color}`} />
                        {c.type === "video" ? <Video className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                        <span className="capitalize">{c.status}</span>
                        · {timeAgo(c.started_at)}
                      </div>
                    </div>
                  </button>
                  <div className="text-sm tabular-nums text-muted-foreground">{fmtDuration(c.duration_seconds || 0)}</div>
                  {canRecall && (
                    <button onClick={() => recall(otherId!, "video")} disabled={busy}
                      className="opacity-0 group-hover:opacity-100 grid h-9 w-9 place-items-center rounded-full bg-success text-white hover:scale-110 transition disabled:opacity-30">
                      <Video className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
