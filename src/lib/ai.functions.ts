import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callGateway(messages: { role: string; content: string }[]) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "raw-fetch",
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.4 }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("AI rate limit — please retry in a moment");
    if (res.status === 402) throw new Error("AI credits exhausted — add credits in Settings → Workspace → Usage");
    throw new Error(`AI error ${res.status}: ${t}`);
  }
  const json = await res.json() as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message?.content || "";
}

// Translate a string to Amharic (used for live subtitles)
export const translateToAmharic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ text: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data }) => {
    const out = await callGateway([
      { role: "system", content: "You are a translator. Translate the user's text to Amharic (አማርኛ). Output ONLY the translation, no quotes, no explanations." },
      { role: "user", content: data.text },
    ]);
    return { translation: out.trim() };
  });

// In-call AI assistant that knows the conversation history with a peer
export const askMeduxAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    prompt: z.string().min(1).max(2000),
    peerId: z.string().uuid().optional(),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let contextStr = "";
    if (data.peerId) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("sender_id, content, created_at")
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${data.peerId}),and(sender_id.eq.${data.peerId},recipient_id.eq.${userId})`)
        .order("created_at", { ascending: false })
        .limit(80);
      if (msgs && msgs.length) {
        contextStr = "Recent chat history with this person (most recent first):\n" +
          msgs.map((m) => `${m.sender_id === userId ? "Me" : "Them"}: ${m.content}`).join("\n");
      }
    }
    const system = `You are Medux AI, a helpful in-call assistant.
You can answer questions about the user's recent conversation with the person they're calling, summarize, translate, or help compose messages.
Be concise (2-4 sentences unless asked for detail). If the user asks about something in chat, cite it briefly.

${contextStr ? `=== CHAT CONTEXT ===\n${contextStr}\n=== END CONTEXT ===` : "No prior chat context available."}`;

    const out = await callGateway([
      { role: "system", content: system },
      ...data.history,
      { role: "user", content: data.prompt },
    ]);
    return { answer: out.trim() };
  });
