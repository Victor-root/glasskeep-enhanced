/**
 * AI Assistant Module (client-side wrapper).
 *
 * Calls the server's /api/ai/chat endpoint, which proxies the request
 * to the configured OpenAI-compatible provider (Ollama, Open WebUI,
 * LiteLLM, OpenAI, …). The server holds the API key and the base URL.
 */

import { api, getAuth } from "./utils/api.js";
import { contentToPlain } from "./utils/richText.js";

function detectLang() {
  const lang = (navigator.language || "en").toLowerCase();
  return lang.startsWith("fr") ? "fr" : "en";
}

/**
 * No-op kept for backward compatibility — the server no longer needs
 * any client-driven initialization.
 */
export async function initAI(onProgress) {
  if (onProgress) onProgress({ status: "ready" });
  return Promise.resolve();
}

// Flatten any note shape (text / checklist / drawing) into a single
// plain-text body the AI can actually read. Without this the model
// receives raw Tiptap JSON for text notes and an empty string for
// checklists (since their text lives in `items[].text`, not `content`).
function noteToPlainText(n) {
  if (!n) return "";
  const type = n.type || "text";

  if (type === "checklist") {
    const items = Array.isArray(n.items) ? n.items : [];
    return items
      .map((it) => {
        const mark = it?.done ? "[x]" : "[ ]";
        const text = (it?.text || "").toString();
        return `- ${mark} ${text}`;
      })
      .join("\n");
  }

  if (type === "draw") {
    // Drawing notes wrap their typed caption inside a JSON blob.
    try {
      const parsed = typeof n.content === "string" ? JSON.parse(n.content) : null;
      return (parsed?.text || "").toString();
    } catch {
      return "";
    }
  }

  // Text notes — content is either the rich-text envelope or legacy
  // Markdown. contentToPlain handles both.
  return contentToPlain(n.content || "");
}

/**
 * Ask the AI assistant a question with optional note context.
 *
 * @param {string} question
 * @param {Array} notes  the user's note objects (any shape)
 * @param {Function} [onProgress]
 * @returns {Promise<{answer: string, citedNoteIds: string[]}>}
 */
export async function askAI(question, notes, onProgress) {
  const auth = getAuth();
  const token = auth?.token;
  if (!token) {
    throw new Error("You must be logged in to use the AI Assistant.");
  }

  if (onProgress) onProgress({ status: "init" });

  // Send a flattened, searchable view of the notes. The server picks
  // the relevant ones by keyword score before forwarding to the model.
  // The `id` is forwarded so the model can cite which notes it used —
  // the server appends a [[NOTES:…]] marker instruction to the prompt
  // and parses it back out before returning.
  const flattened = (notes || [])
    .filter((n) => n && !n.archived && !n.trashed)
    .map((n) => ({
      id: n.id != null ? String(n.id) : "",
      title: (n.title || "").toString(),
      content: noteToPlainText(n),
      tags: Array.isArray(n.tags) ? n.tags.map(String) : [],
    }))
    .filter((n) => n.id && (n.title.trim() || n.content.trim()));

  const debugMode = localStorage.getItem("glasskeep_ai_debug") === "true";
  const lang = detectLang();

  if (debugMode) {
    console.groupCollapsed("[GlassKeep AI Debug] request");
    console.log("question:", question);
    console.log("lang:", lang);
    console.log("notes count:", flattened.length);
    console.table(
      flattened.map((n) => ({
        id: n.id,
        title: n.title,
        tags: n.tags.join(", "),
        contentLength: n.content.length,
        preview: n.content.slice(0, 80).replace(/\n/g, " "),
      })),
    );
    console.groupEnd();
  }

  // Real model inference can take well over the 6 s default timeout
  // baked into api(); allow up to 2 minutes for the chat round-trip.
  const data = await api("/ai/chat", {
    method: "POST",
    token,
    timeoutMs: 120000,
    body: {
      question,
      notes: flattened,
      lang,
      ...(debugMode && { debug: true }),
    },
  });

  if (debugMode) {
    console.groupCollapsed("[GlassKeep AI Debug] response");
    console.log("finishReason:", data?.finishReason);
    console.log("citedNoteIds:", data?.citedNoteIds);
    if (data?.debug) {
      console.log("debug metadata:", data.debug);
      if (Array.isArray(data.debug.pickedNotes)) {
        console.table(data.debug.pickedNotes);
      }
    }
    console.groupEnd();
  }

  if (onProgress) onProgress({ status: "ready" });

  return {
    answer: data?.answer || "",
    citedNoteIds: Array.isArray(data?.citedNoteIds) ? data.citedNoteIds : [],
  };
}

/**
 * Per-note chat: ask the AI a question scoped to a single open note.
 * The note acts as the only context; the temporary message history lives
 * on the client (panel state) and is forwarded each turn so the model
 * can keep a coherent conversation without anything being persisted.
 *
 * @param {Object} params
 * @param {Object} params.note     { id, title, content, tags } of the open note
 * @param {Array}  params.messages prior turns: [{ role: 'user'|'assistant', content }]
 * @param {string} params.question the latest user question
 * @returns {Promise<{answer: string, finishReason: string|null}>}
 */
export async function askNoteAI({ note, messages, question }) {
  const auth = getAuth();
  const token = auth?.token;
  if (!token) {
    throw new Error("You must be logged in to use the AI Assistant.");
  }
  if (!note) throw new Error("Missing note context.");
  if (!question || !String(question).trim()) {
    throw new Error("Missing question.");
  }

  // Flatten the note the same way as global chat — text/checklist/draw
  // notes need their human-readable body, not the raw Tiptap envelope.
  const flatNote = {
    id: note.id != null ? String(note.id) : "",
    title: (note.title || "").toString(),
    content: noteToPlainText(note),
    tags: Array.isArray(note.tags) ? note.tags.map(String) : [],
  };

  const lang = detectLang();

  const data = await api("/ai/note-chat", {
    method: "POST",
    token,
    timeoutMs: 120000,
    body: {
      note: flatNote,
      messages: Array.isArray(messages) ? messages : [],
      question: String(question),
      lang,
    },
  });

  return {
    answer: data?.answer || "",
    finishReason: data?.finishReason || null,
  };
}
