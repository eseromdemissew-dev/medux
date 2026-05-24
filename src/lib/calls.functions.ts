import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Get config for push (publishable VAPID key for the browser to subscribe)
export const getPushConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "" };
});

// Start a 1-on-1 call (also used for "recall from history")
export const startDirectCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    calleeId: z.string().uuid(),
    type: z.enum(["video", "audio"]).default("video"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: codeRow } = await supabaseAdmin.rpc("generate_invite_code");
    const inviteCode = codeRow as string;
    const roomId = crypto.randomUUID();
    const { data: call, error } = await supabaseAdmin.from("calls").insert({
      room_id: roomId,
      initiator_id: userId,
      host_id: userId,
      callee_id: data.calleeId,
      type: data.type,
      status: "ringing",
      is_group: false,
      invite_code: inviteCode,
    }).select().single();
    if (error) throw new Error(error.message);

    // Send push to callee
    await sendPushToUser(data.calleeId, {
      type: "incoming_call",
      title: "Incoming call",
      body: "Medux call",
      tag: `call-${call.id}`,
      call_id: call.id,
    });

    return { call };
  });

// Start a group call — returns invite code + link
export const startGroupCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    type: z.enum(["video", "audio"]).default("video"),
    inviteUserIds: z.array(z.string().uuid()).default([]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: codeRow } = await supabaseAdmin.rpc("generate_invite_code");
    const inviteCode = codeRow as string;
    const roomId = crypto.randomUUID();
    const { data: call, error } = await supabaseAdmin.from("calls").insert({
      room_id: roomId,
      initiator_id: userId,
      host_id: userId,
      callee_id: null,
      type: data.type,
      status: "active",
      is_group: true,
      invite_code: inviteCode,
    }).select().single();
    if (error) throw new Error(error.message);

    // Ring all invited online contacts
    for (const uid of data.inviteUserIds) {
      await sendPushToUser(uid, {
        type: "incoming_call",
        title: "Group call invitation",
        body: "You're invited to a Medux call",
        tag: `call-${call.id}`,
        call_id: call.id,
      });
      // Also drop a notification row so they see in-app
      await supabaseAdmin.from("notifications").insert({
        user_id: uid,
        type: "incoming_call",
        title: "Group call invitation",
        body: `Join code: ${inviteCode}`,
        data: { call_id: call.id, invite_code: inviteCode },
      });
    }

    return { call, inviteCode };
  });

// Look up a call by invite code (for join page)
export const lookupByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    code: z.string().min(6).max(6),
  }).parse(input))
  .handler(async ({ data }) => {
    const { data: call } = await supabaseAdmin.from("calls")
      .select("id, status, type, host_id, is_group, invite_code")
      .eq("invite_code", data.code.toUpperCase())
      .maybeSingle();
    if (!call) throw new Error("Invite code not found");
    if (call.status !== "active" && call.status !== "ringing") throw new Error("This call has ended");
    return { call };
  });

// Join a call as participant
export const joinCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ callId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await supabaseAdmin.from("call_participants").upsert({
      call_id: data.callId,
      user_id: userId,
      joined_at: new Date().toISOString(),
      left_at: null,
    }, { onConflict: "call_id,user_id" });
    return { ok: true };
  });

// Request to join a call (knock). Host is auto-approved. Others get a pending request.
export const requestToJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ callId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: call } = await supabaseAdmin.from("calls")
      .select("host_id, initiator_id, callee_id, is_group")
      .eq("id", data.callId).maybeSingle();
    if (!call) throw new Error("Call not found");
    // Host, initiator, and the direct callee bypass the knock gate.
    if (call.host_id === userId || call.initiator_id === userId || call.callee_id === userId) {
      return { status: "approved" as const };
    }
    type CJRRow = { id: string; status: string };
    const cjr = supabaseAdmin.from("call_join_requests" as never);
    await (cjr as unknown as { upsert: (v: object, o: object) => Promise<unknown> }).upsert(
      { call_id: data.callId, user_id: userId, status: "pending", decided_at: null },
      { onConflict: "call_id,user_id" },
    );
    // Notify host
    const hostId = call.host_id ?? call.initiator_id;
    if (hostId) {
      await supabaseAdmin.from("notifications").insert({
        user_id: hostId,
        type: "join_request",
        title: "Someone wants to join",
        body: "Tap to admit",
        data: { call_id: data.callId, requester_id: userId },
      });
      await sendPushToUser(hostId, {
        type: "join_request",
        title: "Knock knock",
        body: "Someone wants to join your call",
        tag: `knock-${data.callId}-${userId}`,
        call_id: data.callId,
      });
    }
    void cjr; void ({} as CJRRow);
    return { status: "pending" as const };
  });

// Host approves or denies a pending join request.
export const decideJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    requestId: z.string().uuid(),
    approve: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const cjr = supabaseAdmin.from("call_join_requests" as never) as unknown as {
      select: (s: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { call_id: string } | null }> } };
      update: (v: object) => { eq: (k: string, v: string) => Promise<unknown> };
    };
    const { data: req } = await cjr.select("call_id").eq("id", data.requestId).maybeSingle();
    if (!req) throw new Error("Request not found");
    const { data: call } = await supabaseAdmin.from("calls")
      .select("host_id, initiator_id").eq("id", req.call_id).maybeSingle();
    if (!call || (call.host_id !== userId && call.initiator_id !== userId)) {
      throw new Error("Not authorized");
    }
    await cjr.update({
      status: data.approve ? "approved" : "denied",
      decided_at: new Date().toISOString(),
    }).eq("id", data.requestId);
    return { ok: true };
  });

// ---- Web Push sender (server-side) ----
async function sendPushToUser(userId: string, payload: Record<string, unknown>) {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:hello@medux.app";
  if (!vapidPublic || !vapidPrivate) return;

  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  // Dynamic import keeps the bundle small if not present
  let webpush: typeof import("web-push");
  try {
    webpush = (await import("web-push")).default as unknown as typeof import("web-push");
  } catch {
    return;
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint,
        keys: s.keys as { p256dh: string; auth: string },
      }, JSON.stringify(payload));
    } catch (err: unknown) {
      const code = (err as { statusCode?: number } | undefined)?.statusCode;
      if (code === 404 || code === 410) {
        // Subscription gone — remove
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
  }));
}
