import { useState } from "react";
import { api } from "../utils/api.js";
import { t } from "../i18n";
import { localizeServerError } from "../utils/serverErrors.js";

/**
 * The OpenAI-compatible provider form shared by the admin's AI section and
 * the user's custom AI settings: the fields (rendered by
 * components/settings/AiProviderFields), how a server answer fills them,
 * what they send, and the connection test.
 */
export default function useAiProviderFields(token) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(800);

  const applyProviderConfig = (data) => {
    setBaseUrl(data.baseUrl || "");
    setModel(data.model || "");
    setHasApiKey(!!data.hasApiKey);
    setApiKeyDraft("");
    setTemperature(
      typeof data.temperature === "number" ? data.temperature : 0.3,
    );
    setMaxTokens(
      typeof data.maxTokens === "number" ? data.maxTokens : 800,
    );
  };

  const providerBody = () => ({
    baseUrl: baseUrl.trim(),
    model: model.trim(),
    temperature: Number(temperature),
    maxTokens: Math.round(Number(maxTokens) || 0),
  });

  // apiKeyDraft semantics:
  //  - empty   + hasApiKey true  -> keep existing key
  //  - empty   + hasApiKey false -> nothing to send
  //  - non-empty                 -> replace key
  const withApiKeyDraft = (body) => {
    if (apiKeyDraft.length > 0) body.apiKey = apiKeyDraft;
    return body;
  };

  const runTest = async (path, body) => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await api(path, {
        method: "POST",
        token,
        timeoutMs: 60000,
        body,
      });
      setTestResult({
        ok: true,
        message: data?.reply
          ? `${t("aiTestOk")} : ${data.reply}`
          : t("aiTestOk"),
      });
    } catch (err) {
      const raw = String(err?.message || "");
      const localized = localizeServerError(raw, "aiTestFailed");
      // Test button is for diagnostics: keep the raw provider/reason
      // tail that localizeServerError strips, so the user can act on it.
      const detail =
        raw.match(/^AI provider error:\s*(.+)$/)?.[1] ||
        raw.match(/^Failed to reach AI provider\s*\((.+)\)\.?$/)?.[1] ||
        null;
      setTestResult({
        ok: false,
        message: detail && !localized.includes(detail) ? `${localized} : ${detail}` : localized,
      });
    } finally {
      setTesting(false);
    }
  };

  return {
    testing, testResult, setTestResult, runTest,
    applyProviderConfig, providerBody, withApiKeyDraft,
    fields: {
      baseUrl, setBaseUrl,
      model, setModel,
      apiKeyDraft, setApiKeyDraft,
      hasApiKey,
      showKey, setShowKey,
      temperature, setTemperature,
      maxTokens, setMaxTokens,
    },
  };
}
