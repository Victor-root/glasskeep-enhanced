// server/ai/openaiCompatibleProvider.js
// Minimal OpenAI-compatible Chat Completions client.
//
// Speaks the standard `POST {baseUrl}/chat/completions` interface so it
// works with any provider that ships an OpenAI-compatible API: Ollama
// (/v1), Open WebUI, LiteLLM, LM Studio, OpenRouter, OpenAI itself,
// etc. No vendor-specific quirks live here.

const guard = require("./endpointGuard");

function joinUrl(baseUrl, suffix) {
  if (!baseUrl) return suffix;
  const trimmed = baseUrl.replace(/\/+$/, "");
  const tail = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${trimmed}${tail}`;
}

// Human-readable hints for HTTP status codes commonly returned by
// OpenAI-compatible providers when they send no error body.
const PROVIDER_HTTP_HINTS = {
  400: "requête invalide (paramètres incorrects ou modèle non reconnu)",
  401: "clé API invalide ou manquante",
  403: "accès refusé (quota épuisé ou compte suspendu)",
  404: "endpoint ou modèle introuvable — vérifiez l'URL de base et le nom du modèle",
  405: "méthode non autorisée — vérifiez l'URL de base (endpoint /chat/completions)",
  413: "requête trop volumineuse",
  422: "entité non traitable (body malformé)",
  429: "limite de débit atteinte — réessayez plus tard",
  500: "erreur interne du fournisseur",
  502: "fournisseur temporairement indisponible",
  503: "service du fournisseur indisponible",
};

function describeProviderStatus(status) {
  return PROVIDER_HTTP_HINTS[status] ? `HTTP ${status} — ${PROVIDER_HTTP_HINTS[status]}` : `HTTP ${status}`;
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
  // Scheme and shape, before anything is dialled. http/https only: the rest
  // of the URL space has no business behind a chat endpoint.
  const parsed = guard.normalizeProviderUrl(cfg.baseUrl);
  if (!parsed.ok) throw new AIProviderError(parsed.reason, { status: 400 });
}

// Everything the two request paths need to share: the destination check, the
// dispatcher that enforces it at connect time, a deadline, and a refusal to
// follow redirects (a public host answering with a 302 to 127.0.0.1 would
// otherwise walk straight past the destination check).
const REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS) > 0
  ? Number(process.env.AI_REQUEST_TIMEOUT_MS)
  : 120000;

// deadlineMs = 0 means "no total deadline": the streaming path stays open as
// long as the model keeps producing, and is bounded by the connect timeout
// the dispatcher applies plus whatever signal the caller passes.
async function requestInit(cfg, { body, signal, headers, deadlineMs = REQUEST_TIMEOUT_MS }) {
  if (!cfg.allowPrivateEndpoint) {
    const verdict = await guard.checkDestination(cfg.baseUrl, { allowPrivate: false });
    if (!verdict.ok) throw new AIProviderError(verdict.reason, { status: 400 });
  }
  const timer = new AbortController();
  const deadline = deadlineMs > 0 ? setTimeout(() => timer.abort(), deadlineMs) : null;
  // Honour the caller's own signal too, without losing the deadline.
  if (signal) {
    if (signal.aborted) timer.abort();
    else signal.addEventListener("abort", () => timer.abort(), { once: true });
  }
  return {
    init: {
      method: "POST",
      headers: { ...buildHeaders(cfg), ...(headers || {}) },
      body: JSON.stringify(body),
      signal: timer.signal,
      redirect: "error",
      ...(cfg.allowPrivateEndpoint ? {} : { dispatcher: guard.publicOnlyDispatcher() }),
    },
    done: () => { if (deadline) clearTimeout(deadline); },
  };
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
  // The deadline covers the body as well as the connection, so it is only
  // cleared once the payload has been read.
  const { init, done } = await requestInit(cfg, { body, signal });
  let payload = null;
  try {
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Network-level failure (DNS, connection refused, TLS, abort, a
      // destination the guard refused, …). Keep the message generic, never
      // leak the API key, but name a refused destination so the user can act.
      if (err?.cause?.code === "GK_PRIVATE_ADDRESS" || err?.code === "GK_PRIVATE_ADDRESS") {
        throw new AIProviderError(guard.REASON.PRIVATE, { status: 400 });
      }
      const reason = err?.name === "AbortError" ? "request aborted" : "network error";
      throw new AIProviderError(`Failed to reach AI provider (${reason}).`, {
        status: 502,
      });
    }
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  } finally {
    done();
  }

  if (!res.ok) {
    const providerMessage =
      (payload && (payload.error?.message || payload.message)) ||
      describeProviderStatus(res.status);
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
  const { init } = await requestInit(cfg, {
    body, signal, headers: { Accept: "text/event-stream" }, deadlineMs: 0,
  });
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err?.cause?.code === "GK_PRIVATE_ADDRESS" || err?.code === "GK_PRIVATE_ADDRESS") {
      dbg("fetch refused: private destination");
      throw new AIProviderError(guard.REASON.PRIVATE, { status: 400 });
    }
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
      describeProviderStatus(res.status);
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
