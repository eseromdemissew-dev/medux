import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { lookupByCode } from "@/lib/calls.functions";
import { supabase } from "@/integrations/supabase/client";
import { MeduxLogo } from "@/components/MeduxLogo";

export const Route = createFileRoute("/join/$code")({
  head: () => ({ meta: [{ title: "Join call — Medux" }] }),
  component: JoinByCode,
});

function JoinByCode() {
  const { code } = Route.useParams();
  const nav = useNavigate();
  const [status, setStatus] = useState<"checking" | "auth" | "error">("checking");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        // Stash redirect target and bounce to login
        if (typeof window !== "undefined") sessionStorage.setItem("medux-after-login", `/join/${code}`);
        nav({ to: "/login" });
        return;
      }
      try {
        const { call } = await lookupByCode({ data: { code } });
        nav({ to: "/call/$callId", params: { callId: call.id } });
      } catch (e) {
        setErr((e as Error).message);
        setStatus("error");
        toast.error((e as Error).message);
      }
    })();
  }, [code, nav]);

  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="text-center">
        <MeduxLogo size={48} />
        {status === "checking" && <p className="mt-6 text-muted-foreground">Looking up call <span className="font-mono font-bold">{code}</span>…</p>}
        {status === "error" && <p className="mt-6 text-destructive">{err}</p>}
      </div>
    </div>
  );
}
