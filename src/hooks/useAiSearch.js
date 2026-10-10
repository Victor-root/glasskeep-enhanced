import { useEffect, useState } from "react";
import { t } from "../i18n";
import { askAI } from "../ai";
import { api } from "../utils/api.js";

/**
 * The AI assistant of the search bar: whether it is available, and the
 * question asked over the notes with its answer.
 */
export default function useAiSearch({ token, notes }) {
  // Visibility flag mirrored from the server. The authoritative state is
  // the user's AI settings (UserAiSettingsSection calls back through
  // setAiAssistantEnabled).
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [aiCitedNoteIds, setAiCitedNoteIds] = useState([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiLoadingProgress, setAiLoadingProgress] = useState(null);

  useEffect(() => {
    if (!aiAssistantEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the AI answer whenever the assistant gets disabled, from any source
      setAiResponse(null);
      setAiCitedNoteIds([]);
    }
  }, [aiAssistantEnabled]);

  // Mirror the server-side AI preference into the local visibility flag
  // as soon as the session is authenticated. The Settings panel does
  // the same on open (and writes back), but this hydrates the search-
  // bar AI icon immediately on app start.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api("/user/ai/settings", { token })
      .then((data) => {
        if (!cancelled && data && typeof data.enabled === "boolean") {
          // Effective AI availability — even if the user has it enabled,
          // the admin's master switch overrides everything. Custom mode
          // is not a workaround anymore (server enforces this too).
          const adminGate = data.adminAiEnabled !== false;
          setAiAssistantEnabled(data.enabled && adminGate);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAiSearch = async (question) => {
    if (!question || question.trim().length < 3) return;
    setIsAiLoading(true);
    setAiResponse(null);
    setAiCitedNoteIds([]);
    setAiLoadingProgress(0);

    try {
      const result = await askAI(question, notes, (progress) => {
        if (progress.status === "progress") {
          setAiLoadingProgress(progress.progress);
        } else if (progress.status === "ready") {
          setAiLoadingProgress(100);
        }
      });
      setAiResponse(result.answer);
      setAiCitedNoteIds(result.citedNoteIds || []);
    } catch (err) {
      console.error("AI Error:", err);
      setAiResponse(t("aiErrorGeneric"));
      setAiCitedNoteIds([]);
    } finally {
      setIsAiLoading(false);
      setAiLoadingProgress(null);
    }
  };

  return {
    aiAssistantEnabled, setAiAssistantEnabled,
    aiResponse, setAiResponse,
    aiCitedNoteIds, setAiCitedNoteIds,
    isAiLoading,
    aiLoadingProgress,
    handleAiSearch,
  };
}
