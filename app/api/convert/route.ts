import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { getPersona } from "@/lib/db-personas";
import { buildConvertPrompt } from "@/lib/prompt";
import { recordUsage, usageFromOpenRouter } from "@/lib/db-usage-log";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY is not set" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await request.json();
  const { personaId, modelId, text } = body as {
    personaId: string;
    modelId: string;
    text: string;
  };

  const client = await ensureDb();
  const persona = await getPersona(client, personaId);
  if (!persona) {
    return new Response(
      JSON.stringify({ error: `Persona "${personaId}" not found` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const convertPrompt = buildConvertPrompt(persona);

  const apiMessages = [
    { role: "system", content: convertPrompt },
    { role: "user", content: text },
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
        usage: { include: true },
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let capturedUsage: any = null;

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
              if (parsed.usage) {
                capturedUsage = parsed.usage;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } finally {
        controller.close();
        if (capturedUsage) {
          try {
            const u = usageFromOpenRouter(capturedUsage);
            if (u) {
              await recordUsage(client, {
                route: "convert",
                sessionId: null,
                personaId,
                modelId,
                promptTokens: u.promptTokens,
                completionTokens: u.completionTokens,
                cachedTokens: u.cachedTokens,
                cost: u.cost,
              });
            }
          } catch (err) {
            console.error("Failed to record usage:", err);
          }
        }
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
