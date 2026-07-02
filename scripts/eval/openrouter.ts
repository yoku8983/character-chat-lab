export interface ChatCompletionParams {
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
}

export interface ChatCompletionResult {
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usage: any;
}

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function chatCompletion(p: ChatCompletionParams): Promise<ChatCompletionResult> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${p.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: p.model,
          messages: p.messages,
          ...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
          usage: { include: true },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const message = `OpenRouter API error (status ${response.status}): ${errorText}`;
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          lastError = new Error(message);
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        throw new Error(message);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();
      const text: string = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage ?? null;
      return { text, usage };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("chatCompletion failed for an unknown reason");
}
