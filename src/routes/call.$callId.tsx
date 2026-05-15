import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtDuration, initials, Ringtone } from "@/lib/medux";
import { MeduxLogo } from "@/components/MeduxLogo";
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Phone, Monitor, Maximize } from "lucide-react";

export const Route = createFileRoute("/call/$callId")({
  head: () => ({ meta: [{ title: "Call — Medux" }] }),
  component: CallScreen,
});

interface CallRow {
  id: string; room_id: string; type: string; status: string;
  initiator_id: string; callee_id: string; started_at: string; duration_seconds: number | null;
}
interface Profile { id: string; full_name: string | null; avatar_url: string | null; }

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

function CallScreen() {
  const { callId } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [call, setCall] = useState<CallRow | null>(null);
  const [other, setOther] = useState<Profile | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [connected, setConnected] = useState(false);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ringtoneRef = useRef<Ringtone | null>(null);
  const timerRef = useRef<number | null>(null);

  const isInitiator = user?.id === call?.initiator_id;
  const incoming = !isInitiator && call?.status === "ringing";

  // Load call + other party
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("calls").select("*").eq("id", callId).maybeSingle();
      if (!data) { toast.error("Call not found"); nav({ to: "/dashboard" }); return; }
      const c = data as CallRow;
      setCall(c);
      const otherId = c.initiator_id === user.id ? c.callee_id : c.initiator_id;
      const { data: p } = await supabase.from("profiles").select("id, full_name, avatar_url").eq("id", otherId).maybeSingle();
      setOther(p as Profile);
    })();
  }, [callId, user, nav]);

  // Ringtone for incoming call
  useEffect(() => {
    if (incoming) {
      const r = new Ringtone();
      ringtoneRef.current = r;
      r.start();
      return () => r.stop();
    }
  }, [incoming]);

  // Subscribe to call status changes
  useEffect(() => {
    if (!call) return;
    const ch = supabase.channel(`call-status-${call.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${call.id}` }, (payload) => {
        const updated = payload.new as CallRow;
        setCall(updated);
        if (updated.status === "ended" || updated.status === "declined") {
          cleanup();
          setTimeout(() => nav({ to: "/calls" }), 1500);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [call?.id, nav]);

  const cleanup = useCallback(() => {
    ringtoneRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Setup WebRTC after call is active (or when initiator starts)
  const startWebRTC = useCallback(async () => {
    if (!call || !user || pcRef.current) return;
    const pc = new RTCPeerConnection(ICE);
    pcRef.current = pc;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: call.type === "video",
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    localStreamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      if (remoteRef.current) {
        remoteRef.current.srcObject = e.streams[0];
        setConnected(true);
        if (!timerRef.current) {
          timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
        }
      }
    };

    const ch = supabase.channel(`webrtc-${call.room_id}`, { config: { broadcast: { self: false } } });
    channelRef.current = ch;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ch.send({ type: "broadcast", event: "ice", payload: { from: user.id, candidate: e.candidate } });
      }
    };

    ch.on("broadcast", { event: "ice" }, ({ payload }) => {
      if (payload.from !== user.id && payload.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
      }
    });
    ch.on("broadcast", { event: "sdp" }, async ({ payload }) => {
      if (payload.from === user.id) return;
      if (payload.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ch.send({ type: "broadcast", event: "sdp", payload: { from: user.id, type: "answer", sdp: answer } });
      } else if (payload.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
    });

    await ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ch.send({ type: "broadcast", event: "sdp", payload: { from: user.id, type: "offer", sdp: offer } });
      }
    });
  }, [call, user, isInitiator]);

  // Initiator starts WebRTC immediately; callee starts after answering
  useEffect(() => {
    if (call && isInitiator && (call.status === "ringing" || call.status === "active")) {
      startWebRTC();
    }
    if (call && !isInitiator && call.status === "active") {
      startWebRTC();
    }
  }, [call?.status, isInitiator, startWebRTC]);

  async function answerCall() {
    if (!call) return;
    ringtoneRef.current?.stop();
    await supabase.from("calls").update({ status: "active" }).eq("id", call.id);
  }

  async function declineCall() {
    if (!call) return;
    ringtoneRef.current?.stop();
    await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", call.id);
  }

  async function endCall() {
    if (!call) return;
    const dur = seconds;
    await supabase.from("calls").update({ status: "ended", ended_at: new Date().toISOString(), duration_seconds: dur }).eq("id", call.id);
    cleanup();
    nav({ to: "/calls" });
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  }
  function toggleCam() {
    const next = !camOff;
    setCamOff(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
  }

  async function shareScreen() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(screenTrack);
      screenTrack.onended = async () => {
        const camTrack = localStreamRef.current?.getVideoTracks()[0];
        if (sender && camTrack) await sender.replaceTrack(camTrack);
      };
    } catch { /* user cancelled */ }
  }

  if (!call || !user) {
    return <div className="grid min-h-screen place-items-center bg-background"><MeduxLogo size={48} /></div>;
  }

  // Incoming call overlay
  if (incoming) {
    return (
      <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background text-foreground">
        <div className="orb absolute -top-20 -left-20 h-96 w-96" style={{ background: "oklch(0.52 0.22 285 / 0.5)" }} />
        <div className="orb absolute bottom-0 right-0 h-96 w-96" style={{ background: "oklch(0.66 0.16 230 / 0.5)" }} />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative z-10 text-center">
          <div className="relative mx-auto mb-8 h-40 w-40">
            <div className="ring-wave absolute inset-0 rounded-full" />
            <div className="grid h-full w-full place-items-center rounded-full gradient-brand text-5xl font-bold text-white shadow-glow">
              {other?.avatar_url ? <img src={other.avatar_url} className="h-full w-full rounded-full object-cover" alt="" /> : initials(other?.full_name)}
            </div>
          </div>
          <h2 className="font-['Space_Grotesk'] text-3xl font-bold">{other?.full_name || "Unknown"}</h2>
          <p className="mt-1 text-muted-foreground">Incoming {call.type} call…</p>
          <div className="mt-10 flex justify-center gap-6">
            <button onClick={declineCall} className="grid h-16 w-16 place-items-center rounded-full bg-destructive text-white shadow-glow hover:scale-110 active:scale-95 transition">
              <PhoneOff className="h-6 w-6" />
            </button>
            <button onClick={answerCall} className="grid h-16 w-16 place-items-center rounded-full bg-success text-white shadow-glow hover:scale-110 active:scale-95 transition">
              <Phone className="h-6 w-6" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Active call
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {call.type === "video" ? (
        <video ref={remoteRef} autoPlay playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <div className="text-center">
            <div className="relative mx-auto h-48 w-48">
              <div className={`absolute inset-0 rounded-full ${connected ? "" : "ring-wave"}`} />
              <div className="grid h-full w-full place-items-center rounded-full gradient-brand text-6xl font-bold text-white shadow-glow">
                {other?.avatar_url ? <img src={other.avatar_url} className="h-full w-full rounded-full object-cover" alt="" /> : initials(other?.full_name)}
              </div>
            </div>
            <h2 className="mt-8 font-['Space_Grotesk'] text-3xl font-bold">{other?.full_name}</h2>
            <p className="mt-2 text-white/60">{connected ? fmtDuration(seconds) : "Calling…"}</p>
          </div>
        </div>
      )}

      {call.type === "video" && (
        <motion.div drag dragMomentum={false}
          className="absolute bottom-28 right-6 h-40 w-28 overflow-hidden rounded-2xl ring-2 ring-white/20 shadow-glow md:h-48 md:w-32 cursor-move">
          <video ref={localRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        </motion.div>
      )}

      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-6">
        <MeduxLogo size={28} />
        <div className="rounded-full bg-black/40 px-4 py-1.5 text-sm font-medium tabular-nums backdrop-blur">
          {connected ? fmtDuration(seconds) : "Connecting…"}
        </div>
        <div className="text-sm">{other?.full_name}</div>
      </div>

      {/* Controls */}
      <AnimatePresence>
        <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-black/50 px-3 py-3 backdrop-blur shadow-glow">
          <button onClick={toggleMute} className={`grid h-12 w-12 place-items-center rounded-full transition hover:scale-110 ${muted ? "bg-destructive" : "bg-white/10"}`}>
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          {call.type === "video" && (
            <>
              <button onClick={toggleCam} className={`grid h-12 w-12 place-items-center rounded-full transition hover:scale-110 ${camOff ? "bg-destructive" : "bg-white/10"}`}>
                {camOff ? <VideoOff className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
              </button>
              <button onClick={shareScreen} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:scale-110 transition">
                <Monitor className="h-5 w-5" />
              </button>
              <button onClick={() => document.documentElement.requestFullscreen?.()} className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:scale-110 transition">
                <Maximize className="h-5 w-5" />
              </button>
            </>
          )}
          <button onClick={endCall} className="grid h-14 w-14 place-items-center rounded-full bg-destructive shadow-glow hover:scale-110 transition">
            <PhoneOff className="h-6 w-6" />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
