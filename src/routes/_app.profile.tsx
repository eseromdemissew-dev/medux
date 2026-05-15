import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { initials } from "@/lib/medux";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — Medux" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [p, setP] = useState<{ full_name: string | null; username: string | null; avatar_url: string | null; bio: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, username, avatar_url, bio").eq("id", user.id).maybeSingle().then(({ data }) => setP(data));
  }, [user]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl glass p-8 shadow-card text-center">
        <div className="mx-auto grid h-28 w-28 place-items-center rounded-full gradient-brand text-3xl font-bold text-white shadow-glow">
          {p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(p?.full_name)}
        </div>
        <h1 className="mt-5 font-['Space_Grotesk'] text-2xl font-bold">{p?.full_name || "User"}</h1>
        <p className="text-sm text-muted-foreground">@{p?.username}</p>
        {p?.bio && <p className="mt-4 text-sm text-muted-foreground">{p.bio}</p>}
        <Link to="/settings" className="mt-6 inline-block rounded-full gradient-brand px-5 py-2 text-sm font-semibold text-white shadow-glow hover:scale-105 transition">
          Edit profile
        </Link>
      </div>
    </div>
  );
}
