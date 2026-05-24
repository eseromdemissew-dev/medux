import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { initials } from "@/lib/medux";
import { Search, UserPlus, Phone, Video, Check, X, Users as UsersIcon } from "lucide-react";

export const Route = createFileRoute("/_app/contacts")({
  head: () => ({ meta: [{ title: "Contacts — Medux" }] }),
  component: Contacts,
});

interface Profile { id: string; full_name: string | null; username: string | null; avatar_url: string | null; online_status: string; }
interface Contact { id: string; user_id: string; contact_id: string; status: string; }

function Contacts() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);

  async function load() {
    if (!user) return;
    const { data: cs } = await supabase.from("contacts").select("*").or(`user_id.eq.${user.id},contact_id.eq.${user.id}`);
    setContacts((cs as Contact[]) || []);
    const ids = new Set<string>();
    (cs as Contact[] | null)?.forEach((c) => { ids.add(c.user_id); ids.add(c.contact_id); });
    if (ids.size) {
      const { data: ps } = await supabase.from("profiles").select("*").in("id", Array.from(ids));
      const map: Record<string, Profile> = {};
      (ps as Profile[] | null)?.forEach((p) => (map[p.id] = p));
      setProfiles(map);
    }
  }
  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("contacts-change").on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    if (!search.trim() || !user) { setResults([]); return; }
    const t = setTimeout(async () => {
      const q = search.trim();
      const { data } = await supabase.from("profiles").select("*").or(`username.ilike.%${q}%,full_name.ilike.%${q}%`).neq("id", user.id).limit(8);
      setResults((data as Profile[]) || []);
    }, 300);
    return () => clearTimeout(t);
  }, [search, user]);

  async function addContact(target: Profile) {
    if (!user) return;
    const { error } = await supabase.from("contacts").insert({ user_id: user.id, contact_id: target.id, status: "pending" });
    if (error) return toast.error(error.message);
    toast.success(`Friend request sent to ${target.full_name}`);
    setSearch("");
    load();
  }

  async function respond(c: Contact, accept: boolean) {
    if (accept) {
      await supabase.from("contacts").update({ status: "accepted" }).eq("id", c.id);
      // Create reciprocal accepted record
      if (user) await supabase.from("contacts").insert({ user_id: user.id, contact_id: c.user_id, status: "accepted" }).then(() => {});
      toast.success("Friend added");
    } else {
      await supabase.from("contacts").delete().eq("id", c.id);
      toast.success("Request declined");
    }
    load();
  }

  async function startCall(otherId: string, type: "video" | "voice") {
    if (!user) return;
    const room_id = crypto.randomUUID();
    const { data, error } = await supabase.from("calls").insert({
      initiator_id: user.id, callee_id: otherId, type, status: "ringing", room_id,
    }).select().single();
    if (error) return toast.error(error.message);
    nav({ to: "/call/$callId", params: { callId: data.id } });
  }

  if (!user) return null;
  const incoming = contacts.filter((c) => c.contact_id === user.id && c.status === "pending");
  const accepted = contacts.filter((c) => c.status === "accepted");
  const seen = new Set<string>();
  const friends = accepted.map((c) => (c.user_id === user.id ? c.contact_id : c.user_id)).filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-['Space_Grotesk'] text-3xl font-bold">Contacts</h1>
        <p className="mt-1 text-muted-foreground">Find people. Add friends. Make calls.</p>
      </div>

      <div className="rounded-2xl glass p-5 shadow-card">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username or name…"
            aria-label="Search contacts"
            className="w-full rounded-xl bg-input/50 px-10 py-3 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        </div>
        {results.length > 0 && (
          <ul className="mt-3 space-y-1">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-accent/50">
                <div className="grid h-9 w-9 place-items-center rounded-full gradient-brand text-xs font-semibold text-white">{initials(r.full_name)}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground">@{r.username}</div>
                </div>
                <button onClick={() => addContact(r)} className="flex items-center gap-1.5 rounded-full gradient-brand px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:scale-105 transition">
                  <UserPlus className="h-3 w-3" /> Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {incoming.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Friend requests ({incoming.length})</h2>
          <ul className="space-y-2">
            {incoming.map((c) => {
              const p = profiles[c.user_id];
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl glass p-4 shadow-card">
                  <div className="grid h-11 w-11 place-items-center rounded-full gradient-brand text-sm font-semibold text-white">{initials(p?.full_name)}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p?.full_name}</div>
                    <div className="text-xs text-muted-foreground">@{p?.username}</div>
                  </div>
                  <button onClick={() => respond(c, true)} aria-label={`Accept friend request from ${p?.full_name ?? "user"}`} className="grid h-9 w-9 place-items-center rounded-full bg-success text-white hover:scale-110 transition"><Check className="h-4 w-4" /></button>
                  <button onClick={() => respond(c, false)} aria-label={`Decline friend request from ${p?.full_name ?? "user"}`} className="grid h-9 w-9 place-items-center rounded-full bg-destructive text-white hover:scale-110 transition"><X className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Friends ({friends.length})</h2>
        {friends.length === 0 ? (
          <div className="rounded-2xl glass p-12 text-center shadow-card">
            <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-sm text-muted-foreground">No friends yet. Search above to add some.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {friends.map((id) => {
              const p = profiles[id];
              if (!p) return null;
              return (
                <div key={id} className="rounded-2xl glass p-5 shadow-card transition hover:scale-[1.02] hover:shadow-glow">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="grid h-12 w-12 place-items-center rounded-full gradient-brand text-sm font-semibold text-white">
                        {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(p.full_name)}
                      </div>
                      {p.online_status === "online" && <span className="pulse-dot absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card" />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-sm font-semibold">{p.full_name}</div>
                      <div className="truncate text-xs text-muted-foreground">@{p.username}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => startCall(id, "video")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-brand py-2 text-xs font-semibold text-white shadow-glow hover:scale-105 transition">
                      <Video className="h-3.5 w-3.5" /> Video
                    </button>
                    <button onClick={() => startCall(id, "voice")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl glass py-2 text-xs font-semibold hover:scale-105 transition">
                      <Phone className="h-3.5 w-3.5" /> Voice
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
