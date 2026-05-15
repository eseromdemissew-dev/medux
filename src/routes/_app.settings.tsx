import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTheme } from "@/hooks/useAuth";
import { Loader2, Sun, Moon } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Medux" }] }),
  component: Settings,
});

function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      setFullName(data.full_name || "");
      setUsername(data.username || "");
      setBio(data.bio || "");
      setAvatarUrl(data.avatar_url || "");
    });
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName, username, bio, avatar_url: avatarUrl, updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-['Space_Grotesk'] text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your profile and preferences.</p>
      </div>

      <section className="rounded-2xl glass p-6 shadow-card space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Full name</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl bg-input/50 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl bg-input/50 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Bio</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="w-full rounded-xl bg-input/50 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Avatar URL</span>
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" className="w-full rounded-xl bg-input/50 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        </label>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow hover:scale-[1.02] transition disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </section>

      <section className="rounded-2xl glass p-6 shadow-card">
        <h2 className="mb-4 font-semibold">Appearance</h2>
        <div className="flex gap-3">
          {(["light", "dark"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium capitalize transition ${theme === t ? "gradient-brand text-white shadow-glow" : "glass hover:scale-105"}`}>
              {t === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {t} mode
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
