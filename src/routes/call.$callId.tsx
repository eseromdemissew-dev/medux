import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fmtDuration, initials, Ringtone } from "@/lib/medux";
import { MeduxLogo } from "@/components/MeduxLogo";
import { joinCall, decideJoinRequest } from "@/lib/calls.functions";
import { askMeduxAI, translateToAmharic } from "@/lib/ai.functions";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Phone, Monitor, Maximize,
  Copy, Link as LinkIcon, Sparkles, Languages, X, Send, UserCheck, UserX,
} from "lucide-react";

export const Route = createFileRoute("/call/$callId")({
  head: () => ({ meta: [{ title: "Call — Medux" }] }),
  component: CallScreen,
});

interface CallRow {
  id: string; room_id: string; type: string; status: string;
  initiator_id: string; callee_id: string | null;
  is_group: boolean; invite_code: string | null; host_id: string;
  started_at: string; duration_seconds: number | null;
}
interface Profile { id: string; full_name: string | null; avatar_url: string | null; }

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

interface PeerState { pc: RTCPeerConnection; stream?: MediaStream; profile?: Profile; }

// SpeechRecognition typings
type SRConstructor = new () => SpeechRecognition;
interface SpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
}

function CallScreen() {
  const { callId } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [call, setCall] = useState<CallRow | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const peersRef = useRef<Record<string, PeerState>>({});
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showInvite, setShowInvite] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [subtitlesOn, setSubtitlesOn] = useState(false);
  const [subtitle, setSubtitle] = useState<{ en: string; am: string }>({ en: "", am: "" });
  const localRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ringtoneRef = useRef<Ringtone | null>(null);
  const timerRef = useRef<number | null>(null);
  const speechRef = useRef<SpeechRecognition | null>(null);
  const [joinRequests, setJoinRequests] = useState<{ id: string; user_id: string; profile?: Profile }[]>([]);

  const isHost = !!user && !!call && (user.id === (call.host_id ?? call.initiator_id));

  const isInitiator = !!user && !!call && user.id === call.initiator_id;
  const incoming = !!call && !call.is_group && !isInitiator && call.status === "ringing";

  // Load call
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("calls").select("*").eq("id", callId).maybeSingle();
      if (!data) { toast.error("Call not found"); nav({ to: "/dashboard" }); return; }
      setCall(data as CallRow);
    })();
  }, [callId, user, nav]);

  // Ringtone for incoming 1:1
  useEffect(() => {
    if (incoming) {
      const r = new Ringtone();
      ringtoneRef.current = r; r.start();
      return () => r.stop();
    }
  }, [incoming]);

  // Listen for status changes
  useEffect(() => {
    if (!call) return;
    const ch = supabase.channel(`call-status-${call.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${call.id}` }, (payload) => {
        const updated = payload.new as CallRow;
        setCall(updated);
        if (updated.status === "ended" || updated.status === "declined") {
          cleanup();
          setTimeout(() => nav({ to: "/calls" }), 1200);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id]);

  // Host: subscribe to pending join requests for this call
  useEffect(() => {
    if (!call || !user || !isHost) return;
    const cjr = supabase.from("call_join_requests" as never) as unknown as {
      select: (s: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<{ data: { id: string; user_id: string }[] | null }> } };
    };
    const loadPending = async () => {
      const { data } = await cjr.select("id, user_id").eq("call_id", call.id).eq("status", "pending");
      const rows = (data ?? []) as { id: string; user_id: string }[];
      if (rows.length === 0) { setJoinRequests([]); return; }
      const { data: profs } = await supabase.from("profiles")
        .select("id, full_name, avatar_url").in("id", rows.map((r) => r.user_id));
      const pmap: Record<string, Profile> = {};
      (profs as Profile[] | null)?.forEach((p) => (pmap[p.id] = p));
      setJoinRequests(rows.map((r) => ({ ...r, profile: pmap[r.user_id] })));
    };
    loadPending();
    const ch = supabase.channel(`call-knock-${call.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "call_join_requests",
        filter: `call_id=eq.${call.id}`,
      }, () => { loadPending(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [call, user, isHost]);

  async function admit(reqId: string, approve: boolean) {
    try {
      await decideJoinRequest({ data: { requestId: reqId, approve } });
      setJoinRequests((prev) => prev.filter((r) => r.id !== reqId));
      toast.success(approve ? "Admitted" : "Denied");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const cleanup = useCallback(() => {
    ringtoneRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    Object.values(peersRef.current).forEach((p) => p.pc.close());
    peersRef.current = {};
    setPeers({});
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    speechRef.current?.stop?.();
    speechRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Create / get a peer connection for a specific remote user
  const getPeer = useCallback((peerId: string): RTCPeerConnection => {
    if (peersRef.current[peerId]) return peersRef.current[peerId].pc;
    const pc = new RTCPeerConnection(ICE);
    peersRef.current[peerId] = { pc };
    setPeers({ ...peersRef.current });

    localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));

    pc.ontrack = (e) => {
      peersRef.current[peerId] = { ...peersRef.current[peerId], stream: e.streams[0] };
      setPeers({ ...peersRef.current });
      if (!timerRef.current) timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current && user) {
        channelRef.current.send({ type: "broadcast", event: "ice", payload: { from: user.id, to: peerId, candidate: e.candidate } });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
        const cur = peersRef.current[peerId];
        if (cur) { cur.pc.close(); delete peersRef.current[peerId]; setPeers({ ...peersRef.current }); }
      }
    };

    // Fetch profile lazily
    supabase.from("profiles").select("id, full_name, avatar_url").eq("id", peerId).maybeSingle().then(({ data }) => {
      if (data && peersRef.current[peerId]) {
        peersRef.current[peerId] = { ...peersRef.current[peerId], profile: data as Profile };
        setPeers({ ...peersRef.current });
      }
    });

    return pc;
  }, [user]);

  // Start WebRTC (mesh) — invoked once we have media + call is active
  const startMesh = useCallback(async () => {
    if (!call || !user || channelRef.current) return;

    // Acquire media
    if (!localStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: call.type === "video",
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localStreamRef.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;
      } catch {
        toast.error("Camera/mic permission denied");
        nav({ to: "/calls" }); return;
      }
    }

    // Record participation
    joinCall({ data: { callId: call.id } }).catch(() => {});

    const ch = supabase.channel(`webrtc-${call.room_id}`, { config: { broadcast: { self: false }, presence: { key: user.id } } });
    channelRef.current = ch;

    ch.on("broadcast", { event: "hello" }, async ({ payload }) => {
      const peerId = payload.from as string;
      if (peerId === user.id) return;
      // Tie-break: only the lower id initiates the offer to avoid glare
      if (user.id < peerId) {
        const pc = getPeer(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ch.send({ type: "broadcast", event: "sdp", payload: { from: user.id, to: peerId, type: "offer", sdp: offer } });
      }
    });

    ch.on("broadcast", { event: "sdp" }, async ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = getPeer(payload.from);
      if (payload.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ch.send({ type: "broadcast", event: "sdp", payload: { from: user.id, to: payload.from, type: "answer", sdp: answer } });
      } else if (payload.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
    });

    ch.on("broadcast", { event: "ice" }, ({ payload }) => {
      if (payload.to !== user.id) return;
      const pc = getPeer(payload.from);
      pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
    });

    await ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        ch.send({ type: "broadcast", event: "hello", payload: { from: user.id } });
      }
    });
  }, [call, user, getPeer, nav]);

  // Auto-start mesh: initiator immediately; callee after accept; group on load
  useEffect(() => {
    if (!call || !user) return;
    if (call.is_group) { startMesh(); return; }
    if (isInitiator && (call.status === "ringing" || call.status === "active")) { startMesh(); return; }
    if (!isInitiator && call.status === "active") { startMesh(); return; }
  }, [call?.status, call?.is_group, isInitiator, startMesh, user, call]);

  // ---- Subtitles + translation ----
  useEffect(() => {
    if (!subtitlesOn) { speechRef.current?.stop?.(); speechRef.current = null; return; }
    const SR = (window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: SRConstructor }).webkitSpeechRecognition;
    if (!SR) { toast.error("Live subtitles need Chrome/Edge"); setSubtitlesOn(false); return; }
    const sr = new SR();
    sr.continuous = true; sr.interimResults = true; sr.lang = "en-US";
    sr.onresult = async (e) => {
      const last = e.results[e.results.length - 1];
      const text = last[0].transcript.trim();
      if (!text) return;
      setSubtitle((s) => ({ ...s, en: text }));
      if (last.isFinal) {
        try {
          const { translation } = await translateToAmharic({ data: { text } });
          setSubtitle({ en: text, am: translation });
        } catch { /* skip */ }
      }
    };
    sr.onerror = () => { /* keep going */ };
    sr.onend = () => { if (subtitlesOn) try { sr.start(); } catch { /* noop */ } };
    try { sr.start(); } catch { /* noop */ }
    speechRef.current = sr;
    return () => { sr.stop(); speechRef.current = null; };
  }, [subtitlesOn]);

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
    if (call.is_group) {
      // Just leave; others continue
      cleanup(); nav({ to: "/calls" }); return;
    }
    await supabase.from("calls").update({ status: "ended", ended_at: new Date().toISOString(), duration_seconds: seconds }).eq("id", call.id);
    cleanup(); nav({ to: "/calls" });
  }
  function toggleMute() {
    const next = !muted; setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  }
  function toggleCam() {
    const next = !camOff; setCamOff(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
  }
  async function shareScreen() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      Object.values(peersRef.current).forEach(({ pc }) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(screenTrack);
      });
      screenTrack.onended = () => {
        const camTrack = localStreamRef.current?.getVideoTracks()[0];
        if (!camTrack) return;
        Object.values(peersRef.current).forEach(({ pc }) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          sender?.replaceTrack(camTrack);
        });
      };
    } catch { /* cancelled */ }
  }

  if (!call || !user) {
    return <div className="grid min-h-screen place-items-center bg-background"><MeduxLogo size={48} /></div>;
  }

  // Incoming 1:1 overlay
  if (incoming) {
    return (
      <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background text-foreground">
        <div className="orb absolute -top-20 -left-20 h-96 w-96" style={{ background: "oklch(0.52 0.22 285 / 0.5)" }} />
        <div className="orb absolute bottom-0 right-0 h-96 w-96" style={{ background: "oklch(0.66 0.16 230 / 0.5)" }} />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative z-10 text-center">
          <div className="relative mx-auto mb-8 h-40 w-40">
            <div className="ring-wave absolute inset-0 rounded-full" />
            <div className="grid h-full w-full place-items-center rounded-full gradient-brand text-5xl font-bold text-white shadow-glow">
              {initials("Incoming")}
            </div>
          </div>
          <h2 className="font-['Space_Grotesk'] text-3xl font-bold">Incoming call</h2>
          <p className="mt-1 text-muted-foreground">{call.type} call from a contact</p>
          <div className="mt-10 flex justify-center gap-6">
            <button onClick={declineCall} aria-label="Decline call" className="grid h-16 w-16 place-items-center rounded-full bg-destructive text-white shadow-glow hover:scale-110 active:scale-95 transition">
              <PhoneOff className="h-6 w-6" />
            </button>
            <button onClick={answerCall} aria-label="Answer call" className="grid h-16 w-16 place-items-center rounded-full bg-success text-white shadow-glow hover:scale-110 active:scale-95 transition">
              <Phone className="h-6 w-6" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const peerList = Object.entries(peers);
  const inviteUrl = call.invite_code ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${call.invite_code}` : "";
  const otherPeer = peerList[0]?.[1];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <h1 className="sr-only">{call.is_group ? "Group call" : "Call"}</h1>
      {isHost && joinRequests.length > 0 && (
        <div className="absolute left-4 top-20 z-40 w-72 space-y-2 rounded-2xl bg-card/95 p-3 text-foreground shadow-glow backdrop-blur">
          <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waiting to join</div>
          {joinRequests.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl bg-muted/40 p-2">
              <div className="grid h-9 w-9 place-items-center rounded-full gradient-brand text-xs font-semibold text-white">
                {r.profile?.avatar_url ? <img src={r.profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(r.profile?.full_name)}
              </div>
              <div className="flex-1 truncate text-sm font-medium">{r.profile?.full_name ?? "Guest"}</div>
              <button onClick={() => admit(r.id, true)} aria-label="Admit" className="grid h-8 w-8 place-items-center rounded-full bg-success text-white hover:scale-110 transition"><UserCheck className="h-4 w-4" /></button>
              <button onClick={() => admit(r.id, false)} aria-label="Deny" className="grid h-8 w-8 place-items-center rounded-full bg-destructive text-white hover:scale-110 transition"><UserX className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      {/* Video grid */}
      <div className={`grid h-full w-full gap-1 ${peerList.length <= 1 ? "grid-cols-1" : peerList.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"}`}>
        {peerList.length === 0 ? (
          <div className="grid h-full w-full place-items-center">
            <div className="text-center">
              <div className="relative mx-auto h-48 w-48">
                <div className="ring-wave absolute inset-0 rounded-full" />
                <div className="grid h-full w-full place-items-center rounded-full gradient-brand text-6xl font-bold text-white shadow-glow">
                  {initials("Waiting")}
                </div>
              </div>
              <h2 className="mt-8 font-['Space_Grotesk'] text-3xl font-bold">Waiting for others…</h2>
              {call.invite_code && (
                <p className="mt-2 text-white/60">Share code <span className="font-mono font-bold text-white">{call.invite_code}</span></p>
              )}
            </div>
          </div>
        ) : peerList.map(([peerId, p]) => (
          <PeerTile key={peerId} state={p} audioOnly={call.type !== "video"} />
        ))}
      </div>

      {/* Local PiP */}
      {call.type === "video" && (
        <motion.div drag dragMomentum={false}
          className="absolute bottom-28 right-6 h-40 w-28 overflow-hidden rounded-2xl ring-2 ring-white/20 shadow-glow md:h-48 md:w-32 cursor-move z-30">
          <video ref={localRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        </motion.div>
      )}

      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-6">
        <MeduxLogo size={28} />
        <div className="rounded-full bg-black/40 px-4 py-1.5 text-sm font-medium tabular-nums backdrop-blur">
          {peerList.length > 0 ? fmtDuration(seconds) : "Connecting…"}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {call.is_group && <span className="rounded-full bg-white/10 px-3 py-1 text-xs">Group · {peerList.length + 1}</span>}
          {!call.is_group && otherPeer?.profile?.full_name && <span>{otherPeer.profile.full_name}</span>}
        </div>
      </div>

      {/* Subtitles */}
      {subtitlesOn && (subtitle.en || subtitle.am) && (
        <div className="absolute bottom-32 left-1/2 z-20 -translate-x-1/2 max-w-[80%] rounded-2xl bg-black/70 px-4 py-3 text-center backdrop-blur">
          <div className="text-sm text-white">{subtitle.en}</div>
          {subtitle.am && <div className="mt-1 text-sm text-primary-glow" lang="am" dir="ltr">{subtitle.am}</div>}
        </div>
      )}

      {/* Controls */}
      <AnimatePresence>
        <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
          className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 px-3 py-3 backdrop-blur shadow-glow">
          <button onClick={toggleMute} title="Mute" aria-label="Mute" className={`grid h-12 w-12 place-items-center rounded-full transition hover:scale-110 ${muted ? "bg-destructive" : "bg-white/10"}`}>
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          {call.type === "video" && (
            <>
              <button onClick={toggleCam} title="Camera" aria-label="Camera" className={`grid h-12 w-12 place-items-center rounded-full transition hover:scale-110 ${camOff ? "bg-destructive" : "bg-white/10"}`}>
                {camOff ? <VideoOff className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
              </button>
              <button onClick={shareScreen} title="Share screen" aria-label="Share screen" className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:scale-110 transition">
                <Monitor className="h-5 w-5" />
              </button>
            </>
          )}
          <button onClick={() => setSubtitlesOn((v) => !v)} title="Live subtitles + Amharic" aria-label="Live subtitles + Amharic" className={`grid h-12 w-12 place-items-center rounded-full transition hover:scale-110 ${subtitlesOn ? "bg-primary" : "bg-white/10"}`}>
            <Languages className="h-5 w-5" />
          </button>
          <button onClick={() => setShowAI((v) => !v)} title="Medux AI" aria-label="Medux AI" className={`grid h-12 w-12 place-items-center rounded-full transition hover:scale-110 ${showAI ? "bg-primary" : "bg-white/10"}`}>
            <Sparkles className="h-5 w-5" />
          </button>
          <button onClick={() => setShowInvite(true)} title="Invite" aria-label="Invite" className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:scale-110 transition">
            <LinkIcon className="h-5 w-5" />
          </button>
          <button onClick={() => document.documentElement.requestFullscreen?.()} title="Fullscreen" aria-label="Fullscreen" className="grid h-12 w-12 place-items-center rounded-full bg-white/10 hover:scale-110 transition">
            <Maximize className="h-5 w-5" />
          </button>
          <button onClick={endCall} title="End" aria-label="End" className="grid h-14 w-14 place-items-center rounded-full bg-destructive shadow-glow hover:scale-110 transition">
            <PhoneOff className="h-6 w-6" />
          </button>
        </motion.div>
      </AnimatePresence>

      {/* Invite modal */}
      <AnimatePresence>
        {showInvite && call.invite_code && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur" onClick={() => setShowInvite(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="w-full max-w-md rounded-3xl bg-card p-6 text-foreground shadow-glow" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-['Space_Grotesk'] text-xl font-bold">Invite to call</h3>
                <button onClick={() => setShowInvite(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground">Join code</div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 rounded-xl bg-muted px-4 py-3 font-mono text-2xl font-bold tracking-widest text-center">{call.invite_code}</div>
                    <button onClick={() => { navigator.clipboard.writeText(call.invite_code!); toast.success("Code copied"); }}
                      className="grid h-12 w-12 place-items-center rounded-xl gradient-brand text-white"><Copy className="h-4 w-4" /></button>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Invite link</div>
                  <div className="mt-1 flex items-center gap-2">
                    <input readOnly value={inviteUrl} className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm" />
                    <button onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("Link copied"); }}
                      className="grid h-12 w-12 place-items-center rounded-xl gradient-brand text-white"><Copy className="h-4 w-4" /></button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Anyone with the code or link can join. The call stays active while at least one person is connected.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI panel */}
      <AnimatePresence>
        {showAI && (
          <AIChatPanel onClose={() => setShowAI(false)} peerId={!call.is_group ? (call.initiator_id === user.id ? call.callee_id : call.initiator_id) ?? undefined : undefined} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PeerTile({ state, audioOnly }: { state: PeerState; audioOnly: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && state.stream) ref.current.srcObject = state.stream;
  }, [state.stream]);
  return (
    <div className="relative h-full w-full bg-black/40">
      {audioOnly ? (
        <div className="grid h-full w-full place-items-center">
          <div className="grid h-32 w-32 place-items-center rounded-full gradient-brand text-3xl font-bold text-white shadow-glow">
            {state.profile?.avatar_url ? <img src={state.profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(state.profile?.full_name)}
          </div>
        </div>
      ) : (
        <video ref={ref} autoPlay playsInline className="h-full w-full object-cover" />
      )}
      {state.profile?.full_name && (
        <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-3 py-1 text-xs backdrop-blur">{state.profile.full_name}</div>
      )}
    </div>
  );
}

function AIChatPanel({ onClose, peerId }: { onClose: () => void; peerId?: string }) {
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: peerId ? "Hi — I'm Medux AI. I know your recent chat with this person. Ask me anything." : "Hi — I'm Medux AI. Ask me anything." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next = [...history, { role: "user" as const, content: text }];
    setHistory(next);
    setLoading(true);
    try {
      const { answer } = await askMeduxAI({ data: { prompt: text, peerId, history: next.slice(-12) } });
      setHistory([...next, { role: "assistant", content: answer }]);
    } catch (e) {
      setHistory([...next, { role: "assistant", content: (e as Error).message || "AI error" }]);
    } finally { setLoading(false); }
  }

  return (
    <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
      className="absolute right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-card/95 text-foreground backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><span className="font-semibold">Medux AI</span></div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {history.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "gradient-brand text-white" : "bg-muted"}`}>{m.content}</div>
          </div>
        ))}
        {loading && <div className="text-xs text-muted-foreground">Thinking…</div>}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about your chat, draft a reply…" className="flex-1 rounded-xl bg-muted px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
        <button onClick={send} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl gradient-brand text-white disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </div>
    </motion.div>
  );
}
