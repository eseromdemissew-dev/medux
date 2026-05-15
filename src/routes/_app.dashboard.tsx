import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtDuration, initials, timeAgo } from "@/lib/medux";
import { Phone, Video, PhoneIncoming, PhoneMissed, PhoneOutgoing, Users as UsersIcon, Clock, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Medux" }] }),
  component: Dashboard,
});

interface CallRow {
  id: string; type: string; status: string; started_at: string; ended_at: string | null;
  duration_seconds: number | null; initiator_id: string; callee_id: string;
}
interface ProfileLite { id: string; full_name: string | null; username: string | null; avatar_url: string | null; online_status: string; }

function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [contactProfiles, setContactProfiles] = useState<Record<string, ProfileLite>>({});
  const [stats, setStats] = useState({ total: 0, duration: 0, online: 0, missed: 0 });
  const [onlineContacts, setOnlineContacts] = useState<ProfileLite[]>([]);

  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      const [{ data: p }, { data: c }, { data: contacts }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("calls").select("*").or(`initiator_id.eq.${user.id},callee_id.eq.${user.id}`).order("started_at", { ascending: false }).limit(10),
        supabase.from("contacts").select("contact_id, user_id, status").eq("status", "accepted").or(`user_id.eq.${user.id},contact_id.eq.${user.id}`),
      ]);
      if (!live) return;
      setProfile(p as ProfileLite);
      setCalls((c as CallRow[]) || []);

      const ids = new Set<string>();
      (c as CallRow[] | null)?.forEach((cl) => { ids.add(cl.initiator_id); ids.add(cl.callee_id); });
      const contactIds = (contacts || []).map((ct) => (ct.user_id === user.id ? ct.contact_id : ct.user_id));
      contactIds.forEach((id) => ids.add(id));
      ids.delete(user.id);
      if (ids.size) {
        const { data: profs } = await supabase.from("profiles").select("*").in("id", Array.from(ids));
        const map: Record<string, ProfileLite> = {};
        (profs as ProfileLite[] | null)?.forEach((pr) => (map[pr.id] = pr));
        setContactProfiles(map);
        const online = (profs as ProfileLite[] | null)?.filter((pr) => contactIds.includes(pr.id) && pr.online_status === "online") || [];
        setOnlineContacts(online);
      }

      const totalDur = (c as CallRow[] | null)?.reduce((s, cl) => s + (cl.duration_seconds || 0), 0) || 0;
      const missed = (c as CallRow[] | null)?.filter((cl) => cl.status === "missed" && cl.callee_id === user.id).length || 0;
      const onlineCount = contactIds.length ? (await supabase.from("profiles").select("id", { count: "exact", head: true }).in("id", contactIds).eq("online_status", "online")).count || 0 : 0;
      setStats({ total: c?.length || 0, duration: totalDur, online: onlineCount, missed });
    })();
    return () => { live = false; };
  }, [user]);

  const statCards = [
    { label: "Total calls", value: stats.total.toString(), icon: Phone },
    { label: "Call time", value: fmtDuration(stats.duration), icon: Clock },
    { label: "Online now", value: stats.online.toString(), icon: UsersIcon },
    { label: "Missed", value: stats.missed.toString(), icon: PhoneMissed },
  ];

  return (
    <div className="space-y-8">
      <div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-['Space_Grotesk'] text-3xl font-bold">
          Hello, {profile?.full_name?.split(" ")[0] || "there"} 👋
        </motion.h1>
        <p className="mt-1 text-muted-foreground">Ready to connect? Let's make a call.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="rounded-2xl glass p-5 shadow-card transition hover:scale-[1.02] hover:shadow-glow">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-3 text-3xl font-bold">{s.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl glass p-6 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Recent calls</h2>
            <Link to="/calls" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {calls.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <TrendingUp className="mx-auto mb-3 h-10 w-10 opacity-30" />
              No calls yet — start one from your contacts.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {calls.map((cl) => {
                const otherId = cl.initiator_id === user?.id ? cl.callee_id : cl.initiator_id;
                const other = contactProfiles[otherId];
                const outgoing = cl.initiator_id === user?.id;
                const Icon = cl.status === "missed" ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
                const color = cl.status === "missed" ? "text-destructive" : "text-primary";
                return (
                  <li key={cl.id} className="flex items-center gap-3 py-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full gradient-brand text-sm font-semibold text-white">
                      {other?.avatar_url ? <img src={other.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(other?.full_name)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{other?.full_name || "Unknown"}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className={`h-3 w-3 ${color}`} />
                        {cl.type === "video" ? <Video className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                        {timeAgo(cl.started_at)} · {fmtDuration(cl.duration_seconds || 0)}
                      </div>
                    </div>
                    {other && (
                      <Link to="/contacts" className="rounded-full glass px-3 py-1.5 text-xs font-medium hover:scale-105 transition">
                        Call back
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl glass p-6 shadow-card">
          <h2 className="mb-4 font-semibold">Online now</h2>
          {onlineContacts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No contacts online</div>
          ) : (
            <ul className="space-y-3">
              {onlineContacts.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <div className="relative">
                    <div className="grid h-9 w-9 place-items-center rounded-full gradient-brand text-xs font-semibold text-white">
                      {c.avatar_url ? <img src={c.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(c.full_name)}
                    </div>
                    <span className="pulse-dot absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card" />
                  </div>
                  <div className="flex-1 truncate text-sm">{c.full_name}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
