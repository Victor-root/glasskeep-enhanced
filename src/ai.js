/**
 * AI Assistant Module (client-side wrapper).
 *
 * Calls the server's /api/ai/chat endpoint, which proxies the request
 * to the configured OpenAI-compatible provider (Ollama, Open WebUI,
 * LiteLLM, OpenAI, …). The server holds the API key and the base URL.
 */

import { api, getAuth } from "./utils/api.js";

/**
 * No-op kept for backward compatibility — the server no longer needs
 * any client-driven initialization.
 */
export async function initAI(onProgress) {
  if (onProgress) onProgress({ status: "ready" });
  return Promise.resolve();
}

/**
 * Ask the AI assistant a question with optional note context.
 *
 * @param {string} question
 * @param {Array<{title: string, content: string}>} notes
 * @param {Function} [onProgress]
 * @returns {Promise<string>} the assistant's answer
 */
export async function askAI(question, notes, onProgress) {
  const auth = getAuth();
  const token = auth?.token;
  if (!token) {
    throw new Error("You must be logged in to use the AI Assistant.");
  }

  if (onProgress) onProgress({ status: "init" });

  const data = await api("/ai/chat", {
    method: "POST",
    token,
    body: {
      question,
      notes: (notes || []).map((n) => ({
        title: n?.title || "",
        content: n?.content || "",
      })),
    },
  });

  if (onProgress) onProgress({ status: "ready" });

  return data?.answer || "";
}
