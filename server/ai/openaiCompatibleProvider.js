// server/ai/openaiCompatibleProvider.js
// Minimal OpenAI-compatible Chat Completions client.
//
// Speaks the standard `POST {baseUrl}/chat/completions` interface so it
// works with any provider that ships an OpenAI-compatible API: Ollama
// (/v1), Open WebUI, LiteLLM, LM Studio, OpenRouter, OpenAI itself,
// etc. No vendor-specific quirks live here.

function joinUrl(baseUrl, suffix) {
  if (!baseUrl) return suffix;
  const trimmed = baseUrl.replace(/\/+$/, "");
  const tail = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${trimmed}${tail}`;
}

// Strip an OpenAI-style API key from a string before logging it. The
// substring keeps just enough to disambiguate but not enough to reuse.
function redactApiKey(value) {
  if (!value) return value;
  if (typeof value !== "string") return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

class AIProviderError extends Error {
  constructor(message, { status, providerStatus, providerBody } = {}) {
    super(message);
    this.name = "AIProviderError";
    this.status = status || 502;
    this.providerStatus = providerStatus;
    this.providerBody = providerBody;
  }
}

function validateConfig(cfg) {
  if (!cfg) throw new AIProviderError("AI is not configured.", { status: 503 });
  if (!cfg.enabled) throw new AIProviderError("AI is disabled.", { status: 503 });
  if (!cfg.baseUrl) throw new AIProviderError("AI base URL is not set.", { status: 400 });
  if (!cfg.model) throw new AIProviderError("AI model is not set.", { status: 400 });
}

function buildHeaders(cfg) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  return headers;
}

// Calls the configured provider's /chat/completions endpoint and returns
// the assistant text content. Throws AIProviderError on misconfig or
// upstream failure — never logs the API key or full prompts.
async function chatCompletion(cfg, { messages, temperature, maxTokens, signal } = {}) {
  validateConfig(cfg);

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AIProviderError("Messages array is required.", { status: 400 });
  }

  const url = joinUrl(cfg.baseUrl, "/chat/completions");
  const body = {
    model: cfg.model,
    messages,
    temperature:
      typeof temperature === "number" ? temperature : cfg.temperature ?? 0.3,
    max_tokens:
      typeof maxTokens === "number" ? maxTokens : cfg.maxTokens ?? 800,
    stream: false,
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(cfg),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // Network-level failure (DNS, connection refused, TLS, abort, …).
    // Keep the error message generic — never leak the API key.
    const reason = err?.name === "AbortError" ? "request aborted" : "network error";
    throw new AIProviderError(`Failed to reach AI provider (${reason}).`, {
      status: 502,
    });
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const providerMessage =
      (payload && (payload.error?.message || payload.message)) ||
      `HTTP ${res.status}`;
    throw new AIProviderError(`AI provider error: ${providerMessage}`, {
      status: 502,
      providerStatus: res.status,
      providerBody: payload,
    });
  }

  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const content = choice?.message?.content ?? choice?.text ?? "";

  return {
    content: typeof content === "string" ? content : String(content || ""),
    finishReason: choice?.finish_reason || null,
    usage: payload?.usage || null,
  };
}

// Streaming variant of chatCompletion. Issues the same request with
// stream:true and yields incremental content deltas as the upstream
// emits them via Server-Sent Events. Each yielded value is one of:
//   { delta: string }          — partial assistant text
//   { finishReason: string }   — terminal stop reason from upstream
// Upstream errors and network failures throw AIProviderError, exactly
// like the non-streaming path.
async function* chatCompletionStream(
  cfg,
  { messages, temperature, maxTokens, signal, onDebug } = {},
) {
  validateConfig(cfg);
  const dbg = typeof onDebug === "function" ? onDebug : () => {};

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AIProviderError("Messages array is required.", { status: 400 });
  }

  const url = joinUrl(cfg.baseUrl, "/chat/completions");
  const body = {
    model: cfg.model,
    messages,
    temperature:
      typeof temperature === "number" ? temperature : cfg.temperature ?? 0.3,
    max_tokens:
      typeof maxTokens === "number" ? maxTokens : cfg.maxTokens ?? 800,
    stream: true,
  };

  dbg(`fetch start url=${url} model=${cfg.model}`);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { ...buildHeaders(cfg), Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    const reason = err?.name === "AbortError" ? "request aborted" : "network error";
    dbg(`fetch failed: ${err?.message || reason}`);
    throw new AIProviderError(`Failed to reach AI provider (${reason}).`, {
      status: 502,
    });
  }
  dbg(`fetch resolved status=${res.status} content-type=${res.headers.get("content-type") || "?"}`);

  if (!res.ok) {
    let payload = null;
    try { payload = await res.json(); } catch {}
    const providerMessage =
      (payload && (payload.error?.message || payload.message)) ||
      `HTTP ${res.status}`;
    dbg(`fetch !ok: ${providerMessage}`);
    throw new AIProviderError(`AI provider error: ${providerMessage}`, {
      status: 502,
      providerStatus: res.status,
      providerBody: payload,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let readCount = 0;
  while (true) {
    const { value, done } = await reader.read();
    readCount += 1;
    if (done) {
      dbg(`reader done after ${readCount} read(s), buffer leftover=${buffer.length}b`);
      break;
    }
    const chunkText = decoder.decode(value, { stream: true });
    buffer += chunkText;
    if (readCount <= 3) {
      dbg(`chunk #${readCount} (${value?.byteLength || 0}b) preview=${JSON.stringify(chunkText.slice(0, 200))}`);
    }
    // SSE frames are separated by a blank line. Process complete frames
    // and keep the trailing partial in the buffer.
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const rawLine of frame.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          dbg(`[DONE] sentinel after ${readCount} read(s)`);
          return;
        }
        let json;
        try { json = JSON.parse(data); } catch { continue; }
        const choice = Array.isArray(json?.choices) ? json.choices[0] : null;
        const delta = choice?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield { delta };
        }
        if (choice?.finish_reason) {
          yield { finishReason: choice.finish_reason };
        }
      }
    }
  }
}

// Probe the provider with a tiny prompt to validate the configuration.
// Used by the admin "Test connection" button. Keeps the request small
// (max_tokens=16) so it stays cheap on remote providers.
async function testConnection(cfg) {
  return chatCompletion(cfg, {
    messages: [
      {
        role: "system",
        content: "You are a connectivity check. Reply with the single word OK.",
      },
      { role: "user", content: "Reply with OK." },
    ],
    temperature: 0,
    maxTokens: 16,
  });
}

module.exports = {
  AIProviderError,
  chatCompletion,
  chatCompletionStream,
  testConnection,
  joinUrl,
  redactApiKey,
};
