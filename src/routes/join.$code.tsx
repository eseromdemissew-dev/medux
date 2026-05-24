import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { lookupByCode, requestToJoin } from "@/lib/calls.functions";
import { supabase } from "@/integrations/supabase/client";
import { MeduxLogo } from "@/components/MeduxLogo";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/join/$code")({
  head: () => ({ meta: [{ title: "Join call — Medux" }] }),
  component: JoinByCode,
});

function JoinByCode() {
  const { code } = Route.useParams();
  const nav = useNavigate();
  const [phase, setPhase] = useState<"checking" | "waiting" | "denied" | "error">("checking");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (typeof window !== "undefined") sessionStorage.setItem("medux-after-login", `/join/${code}`);
        nav({ to: "/login" });
        return;
      }
      try {
        const { call } = await lookupByCode({ data: { code } });
        const { status } = await requestToJoin({ data: { callId: call.id } });
        if (!active) return;
        if (status === "approved") {
          nav({ to: "/call/$callId", params: { callId: call.id } });
          return;
        }
        setPhase("waiting");

        // Subscribe to my own request row updates
        channel = supabase
          .channel(`cjr-${call.id}-${u.user.id}`)
          .on("postgres_changes", {
            event: "UPDATE", schema: "public", table: "call_join_requests",
            filter: `call_id=eq.${call.id}`,
          }, (payload) => {
            const row = payload.new as { user_id: string; status: string };
            if (row.user_id !== u.user!.id) return;
            if (row.status === "approved") {
              nav({ to: "/call/$callId", params: { callId: call.id } });
            } else if (row.status === "denied") {
              setPhase("denied");
            }
          })
          .subscribe();
      } catch (e) {
        if (!active) return;
        setErr((e as Error).message);
        setPhase("error");
        toast.error((e as Error).message);
      }
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [code, nav]);

  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="max-w-sm text-center">
        <MeduxLogo size={48} />
        {phase === "checking" && (
          <p className="mt-6 text-muted-foreground">
            Looking up call <span className="font-mono font-bold">{code}</span>…
          </p>
        )}
        {phase === "waiting" && (
          <div className="mt-6">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full glass">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
            <h1 className="font-['Space_Grotesk'] text-xl font-semibold">Waiting for host to admit you</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We've notified the host of call <span className="font-mono font-bold">{code}</span>.
              You'll join automatically once they let you in.
            </p>
          </div>
        )}
        {phase === "denied" && (
          <div className="mt-6">
            <h1 className="font-['Space_Grotesk'] text-xl font-semibold text-destructive">Not admitted</h1>
            <p className="mt-2 text-sm text-muted-foreground">The host declined your request to join.</p>
          </div>
        )}
        {phase === "error" && <p className="mt-6 text-destructive">{err}</p>}
      </div>
    </div>
  );
}
