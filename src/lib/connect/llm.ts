/**
 * Shared model client for the adviser and the background agents. Server-only.
 * One provider selection (OpenAI by default, Meta Llama API on request) used
 * by every model call, so agents always run on the configured provider.
 */

export type ProviderConfig = {
  url: string;
  apiKey: string;
  model: string;
  strictJsonSchema: boolean;
};

export function providerName(): string {
  const provider = (process.env.LLM_PROVIDER ?? "openai").trim().toLowerCase();
  return provider === "llama" || provider === "meta" ? "llama" : "openai";
}

/** Null when the selected provider has no API key configured. */
export function providerConfig(): ProviderConfig | null {
  if (providerName() === "llama") {
    const apiKey = process.env.LLAMA_API_KEY;
    if (!apiKey) return null;
    return {
      url: "https://api.llama.com/compat/v1/chat/completions",
      apiKey,
      model: process.env.LLAMA_MODEL ?? "Llama-4-Scout-17B-16E-Instruct",
      strictJsonSchema: false,
    };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    url: "https://api.openai.com/v1/chat/completions",
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    strictJsonSchema: true,
  };
}

export function providerKeyName(): string {
  return providerName() === "llama" ? "LLAMA_API_KEY" : "OPENAI_API_KEY";
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Parse the model's reply as JSON. Returns null on any transport, HTTP, or
 * parse failure — callers treat null as "model unavailable" and fall back.
 */
export async function chatJson(
  config: ProviderConfig,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number; jsonSchema?: unknown },
): Promise<unknown> {
  const timeoutMs = options?.timeoutMs ?? 25_000;
  const response_format =
    options?.jsonSchema !== undefined && config.strictJsonSchema
      ? { type: "json_schema", json_schema: options.jsonSchema }
      : { type: "json_object" };
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        ...(config.strictJsonSchema ? { store: false } : {}),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 700,
        messages,
        response_format,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) return null;
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}
