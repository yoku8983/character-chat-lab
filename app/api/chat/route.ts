import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { getPersona } from "@/lib/db-personas";
import { getTopMemories } from "@/lib/db-memories";
import { buildSystemPrompt, buildFewShotMessages } from "@/lib/prompt";
import { capMessageHistory, DEFAULT_MAX_HISTORY_MESSAGES } from "@/lib/history";
import { ChatMessage } from "@/lib/types";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY is not set" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await request.json();
  const { personaId, modelId, messages } = body as {
    personaId: string;
    modelId: string;
    messages: ChatMessage[];
  };

  const client = await ensureDb();
  const persona = await getPersona(client, personaId);
  if (!persona) {
    return new Response(
      JSON.stringify({ error: `Persona "${personaId}" not found` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const episodicMemories = (await getTopMemories(client, personaId, 20)).map((m) => m.content);
  const systemPrompt = buildSystemPrompt(persona, episodicMemories);
  const fewShot = buildFewShotMessages(persona);

  const parsedMax = parseInt(process.env.CHAT_MAX_HISTORY_MESSAGES ?? "", 10);
  const maxHistory = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : DEFAULT_MAX_HISTORY_MESSAGES;
  const cappedMessages = capMessageHistory(messages, maxHistory);

  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...fewShot,
    ...cappedMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: apiMessages,
        stream: true,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(
      JSON.stringify({ error: `OpenRouter API error: ${errorText}` }),
      { status: response.status, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
