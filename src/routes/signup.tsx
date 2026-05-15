import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthShell } from "@/components/AuthShell";
import { Loader2, Mail, Lock, User } from "lucide-react";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up — Medux" }] }),
  component: SignupPage,
});

function SignupPage() {
  const nav = useNavigate();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = Math.min(4, Math.floor(password.length / 3));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be 6+ chars");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName, username },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Check your email to verify.");
    nav({ to: "/dashboard" });
  }

  async function handleGoogle() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) return toast.error("Google sign-in failed");
    if (!r.redirected) nav({ to: "/dashboard" });
  }

  return (
    <AuthShell title="Create your account" subtitle="Join Medux and start calling"
      footer={<>Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link></>}>
      <button onClick={handleGoogle} className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl glass px-4 py-3 text-sm font-medium hover:scale-[1.01] transition">
        <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name"
            className="w-full rounded-xl bg-input/50 px-10 py-3 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        </div>
        <input required value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          placeholder="username" className="w-full rounded-xl bg-input/50 px-4 py-3 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
            className="w-full rounded-xl bg-input/50 px-10 py-3 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
            className="w-full rounded-xl bg-input/50 px-10 py-3 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary" />
        </div>
        {password.length > 0 && (
          <div className="flex gap-1">
            {[0,1,2,3].map((i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition ${i < strength ? "gradient-brand" : "bg-border"}`} />
            ))}
          </div>
        )}
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl gradient-brand px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.01] disabled:opacity-60">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Create account
        </button>
      </form>
    </AuthShell>
  );
}
