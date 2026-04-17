import React from "react";
import { t } from "../../i18n";
import { Sparkles, CloseIcon } from "../../icons/index.jsx";
import NoteCreationButtons from "./NoteCreationButtons.jsx";
import MobileCreateFab from "./MobileCreateFab.jsx";
import { renderSafeMarkdown } from "../../utils/markdown.jsx";

export default function NotesComposer({
  dark,
  activeTagFilter,
  composerType,
  setComposerType,
  title,
  setTitle,
  content,
  setContent,
  contentRef,
  clInput,
  setClInput,
  addComposerItem,
  clItems,
  composerDrawingData,
  setComposerDrawingData,
  composerImages,
  setComposerImages,
  composerFileRef,
  composerTagList,
  setComposerTagList,
  composerTagInput,
  setComposerTagInput,
  composerTagFocused,
  setComposerTagFocused,
  composerTagInputRef,
  tagsWithCounts,
  composerColor,
  setComposerColor,
  addNote,
  onDirectDraw,
  onDirectText,
  onDirectChecklist,
  isDesktop,
  addImagesToState,
  formatComposer,
  showComposerFmt,
  setShowComposerFmt,
  composerFmtBtnRef,
  onComposerKeyDown,
  composerCollapsed,
  setComposerCollapsed,
  titleRef,
  composerRef,
  colorBtnRef,
  showColorPop,
  setShowColorPop,
  localAiEnabled,
  aiResponse,
  setAiResponse,
  isAiLoading,
  aiLoadingProgress,
  onAiSearch,
  search,
  setSearch,
  syncStatus,
}) {
  return (
    <>
      {/* AI Response Box */}
      {localAiEnabled && (aiResponse || isAiLoading) && (
        <div className="px-4 sm:px-6 md:px-8 lg:px-12 mb-6">
          <div className="max-w-2xl mx-auto glass-card rounded-xl shadow-lg p-5 border border-indigo-500/30 relative bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 z-[50]">
            {isAiLoading && (
              <div
                className="absolute top-0 left-0 h-1 bg-indigo-500 transition-all duration-300"
                style={{
                  width: aiLoadingProgress ? `${aiLoadingProgress}%` : "5%",
                }}
              />
            )}
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-semibold text-indigo-700 dark:text-indigo-300">{t("aiAssistant")}</h3>
              {aiResponse && !isAiLoading && (
                <button
                  onClick={() => {
                    setAiResponse(null);
                    setSearch("");
                  }}
                  className="ml-auto p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                  data-tooltip={t("clearResponse")}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
              {isAiLoading ? (
                <p className="animate-pulse text-gray-500 italic flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />{t("aiAssistantThinking")}</p>
              ) : (
                <div
                  className="text-gray-800 dark:text-gray-200 note-content"
                  dangerouslySetInnerHTML={{
                    __html: renderSafeMarkdown(aiResponse),
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Composer — hidden in trash and archive views */}
      {activeTagFilter !== "TRASHED" && activeTagFilter !== "ARCHIVED" && (
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="max-w-2xl mx-auto">
          {isDesktop ? (
            <NoteCreationButtons
              onCreateText={onDirectText}
              onCreateChecklist={onDirectChecklist}
              onCreateDraw={onDirectDraw}
            />
          ) : (
            <MobileCreateFab
              onCreateText={onDirectText}
              onCreateChecklist={onDirectChecklist}
              onCreateDraw={onDirectDraw}
            />
          )}
        </div>
      </div>
      )}
    </>
  );
}
