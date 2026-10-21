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

// Parameters a model refuses, learnt from the provider's own answer and
// kept per endpoint and model, so later requests go out right the first
// time. OpenAI's newer models (gpt-5, the o-series) want the reply length
// as max_completion_tokens rather than max_tokens, and only their default
// temperature; their 400 names the parameter in `error.param`. Bounded:
// the oldest entry goes once there are too many.
const MAX_LEARNT_MODELS = 200;
const learnt = new Map();
const learntKey = (cfg) => `${cfg.baseUrl}\n${cfg.model}`;

// What a refusal teaches, or null when it is not one of those.
function refusedParameter(status, payload) {
  const err = payload?.error;
  if (status !== 400 || !err) return null;
  if (err.param === "max_tokens" && err.code === "unsupported_parameter") return "completionTokens";
  if (err.param === "temperature" && ["unsupported_parameter", "unsupported_value"].includes(err.code)) {
    return "noTemperature";
  }
  return null;
}

// Records what a refusal teaches. False when there is nothing new to
// learn, which leaves the refusal to be reported as is.
function learnRefusal(cfg, status, payload) {
  const lesson = refusedParameter(status, payload);
  const key = learntKey(cfg);
  const known = learnt.get(key) || {};
  if (!lesson || known[lesson]) return false;
  learnt.delete(key);
  learnt.set(key, { ...known, [lesson]: true });
  if (learnt.size > MAX_LEARNT_MODELS) learnt.delete(learnt.keys().next().value);
  return true;
}

// The /chat/completions request both paths send, once the configuration
// and the messages have been checked.
function chatRequest(cfg, { messages, temperature, maxTokens }, stream) {
  validateConfig(cfg);

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AIProviderError("Messages array is required.", { status: 400 });
  }

  const quirks = learnt.get(learntKey(cfg)) || {};
  return {
    url: joinUrl(cfg.baseUrl, "/chat/completions"),
    body: {
      model: cfg.model,
      messages,
      ...(quirks.noTemperature ? {} : {
        temperature: typeof temperature === "number" ? temperature : cfg.temperature ?? 0.3,
      }),
      [quirks.completionTokens ? "max_completion_tokens" : "max_tokens"]:
        typeof maxTokens === "number" ? maxTokens : cfg.maxTokens ?? 800,
      stream,
    },
  };
}

// Sends the chat request, and sends it again while the provider refuses a
// parameter this model does not take (see learnRefusal): each round learns
// one more, so this ends. Any other failure is thrown as the provider put
// it; a success is returned with `done`, which ends its deadline.
async function sendChat(cfg, args, stream, { signal, headers, deadlineMs, dbg }) {
  for (;;) {
    const { url, body } = chatRequest(cfg, args, stream);
    const { init, done } = await requestInit(cfg, { body, signal, headers, deadlineMs });
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      done();
      throw unreachableError(err, dbg);
    }
    if (res.ok) return { url, res, done };
    let payload = null;
    try { payload = await res.json(); } catch { /* body is not JSON: fall back to the status text */ }
    done();
    if (!learnRefusal(cfg, res.status, payload)) throw upstreamError(res.status, payload, dbg);
    dbg(`model refuses ${payload.error.param}: sending again without it`);
  }
}

// The error for a request that never got an answer (DNS, connection
// refused, TLS, abort, a destination the guard refused, ...). Keep the
// message generic, never leak the API key, but name a refused destination
// so the user can act.
function unreachableError(err, dbg) {
  if (err?.cause?.code === "GK_PRIVATE_ADDRESS" || err?.code === "GK_PRIVATE_ADDRESS") {
    dbg("fetch refused: private destination");
    return new AIProviderError(guard.REASON.PRIVATE, { status: 400 });
  }
  const reason = err?.name === "AbortError" ? "request aborted" : "network error";
  dbg(`fetch failed: ${err?.message || reason}`);
  return new AIProviderError(`Failed to reach AI provider (${reason}).`, {
    status: 502,
  });
}

// The error for a non-2xx answer, named after what the provider said.
function upstreamError(status, payload, dbg) {
  const providerMessage =
    (payload && (payload.error?.message || payload.message)) ||
    describeProviderStatus(status);
  dbg(`fetch !ok: ${providerMessage}`);
  return new AIProviderError(`AI provider error: ${providerMessage}`, {
    status: 502,
    providerStatus: status,
    providerBody: payload,
  });
}

const noDebug = () => {};

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
  // The deadline covers the body as well as the connection, so it is only
  // cleared once the payload has been read.
  const { res, done } = await sendChat(cfg, { messages, temperature, maxTokens }, false, { signal, dbg: noDebug });
  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  } finally {
    done();
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
  const dbg = typeof onDebug === "function" ? onDebug : noDebug;

  dbg(`fetch start model=${cfg.model}`);
  const { url, res } = await sendChat(cfg, { messages, temperature, maxTokens }, true, {
    signal, headers: { Accept: "text/event-stream" }, deadlineMs: 0, dbg,
  });
  dbg(`fetch resolved url=${url} status=${res.status} content-type=${res.headers.get("content-type") || "?"}`);

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
// (a 16-token reply) so it stays cheap on remote providers.
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
};
