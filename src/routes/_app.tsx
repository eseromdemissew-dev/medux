import { createFileRoute, Outlet, Link, useNavigate, useLocation, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { MeduxLogo } from "@/components/MeduxLogo";
import { LayoutDashboard, Users, PhoneCall, MessageSquare, Settings, LogOut, Sun, Moon, Bell } from "lucide-react";
import { useAuth, useTheme } from "@/hooks/useAuth";
import { initials } from "@/lib/medux";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/calls", label: "Calls", icon: PhoneCall },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AppLayout() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null; username: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, avatar_url, username").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));

    // Update presence
    supabase.from("profiles").update({ online_status: "online", last_seen: new Date().toISOString() }).eq("id", user.id).then(() => {});
    const interval = setInterval(() => {
      supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", user.id).then(() => {});
    }, 30000);
    const handleUnload = () => {
      supabase.from("profiles").update({ online_status: "offline" }).eq("id", user.id).then(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => { clearInterval(interval); window.removeEventListener("beforeunload", handleUnload); handleUnload(); };
  }, [user]);

  // Listen for incoming calls (insert on calls where callee_id = me)
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`incoming-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${user.id}` }, (payload) => {
        const call = payload.new as { id: string; status: string; room_id: string };
        if (call.status === "ringing") nav({ to: "/call/$callId", params: { callId: call.id } });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, nav]);

  async function logout() {
    await supabase.auth.signOut();
    nav({ to: "/" });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-border bg-card/50 px-4 py-6 backdrop-blur md:flex">
        <Link to="/dashboard" className="mb-8 px-2"><MeduxLogo showText size={30} /></Link>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className="relative block">
                {active && (
                  <motion.div layoutId="active-pill" className="absolute inset-0 gradient-brand rounded-xl shadow-glow" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <span className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "text-white" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
                  <n.icon className="h-4 w-4" />{n.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 pt-4">
          <button onClick={toggle} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <Link to="/profile" className="flex items-center gap-3 rounded-xl glass p-2.5 hover:scale-[1.02] transition">
            <div className="grid h-9 w-9 place-items-center rounded-full gradient-brand text-sm font-semibold text-white">
              {profile?.avatar_url ? <img src={profile.avatar_url} className="h-full w-full rounded-full object-cover" alt="" /> : initials(profile?.full_name)}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="truncate text-sm font-medium">{profile?.full_name || "User"}</div>
              <div className="truncate text-xs text-muted-foreground">@{profile?.username}</div>
            </div>
          </Link>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 pb-20 md:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-6 py-4 backdrop-blur">
          <Link to="/dashboard" className="md:hidden"><MeduxLogo size={28} /></Link>
          <div />
          <div className="flex items-center gap-2">
            <button className="grid h-9 w-9 place-items-center rounded-full glass"><Bell className="h-4 w-4" /></button>
            <button onClick={toggle} className="grid h-9 w-9 place-items-center rounded-full glass md:hidden">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <div className="px-6 py-6 md:px-10 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-border bg-card/90 px-2 py-2 backdrop-blur md:hidden">
        {NAV.map((n) => {
          const active = loc.pathname.startsWith(n.to);
          return (
            <Link key={n.to} to={n.to} className={`flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>
              <n.icon className="h-5 w-5" />{n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
