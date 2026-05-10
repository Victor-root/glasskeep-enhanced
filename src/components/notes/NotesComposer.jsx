import React from "react";
import { t } from "../../i18n";
import { Sparkles, CloseIcon } from "../../icons/index.jsx";
import NoteCreationButtons from "./NoteCreationButtons.jsx";
import MobileCreateFab from "./MobileCreateFab.jsx";
import NoteCard from "./NoteCard.jsx";
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
  onDirectAudio,
  fabOpen,
  setFabOpen,
  isDesktop,
  multiMode,
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
  aiAssistantEnabled,
  aiResponse,
  setAiResponse,
  aiCitedNoteIds,
  setAiCitedNoteIds,
  isAiLoading,
  aiLoadingProgress,
  onAiSearch,
  search,
  setSearch,
  syncStatus,
  notes,
  currentUser,
  openModal,
  isOnline,
  onUpdateChecklistItem,
}) {
  // Resolve cited IDs back to note objects. The server returned only
  // IDs that were in the picked context, but the user may have deleted
  // them since — keep the lookup defensive.
  const citedNotes =
    Array.isArray(aiCitedNoteIds) && aiCitedNoteIds.length > 0
      ? aiCitedNoteIds
          .map((id) => (notes || []).find((n) => String(n?.id) === String(id)))
          .filter(Boolean)
      : [];
  return (
    <>
      {/* AI Response Box */}
      {aiAssistantEnabled && (aiResponse || isAiLoading) && (
        <div className="px-4 sm:px-6 md:px-8 lg:px-12 mb-6">
          <div className="max-w-2xl mx-auto glass-card rounded-xl shadow-lg p-5 border border-indigo-500/30 relative bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30">
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
                    if (setAiCitedNoteIds) setAiCitedNoteIds([]);
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
            {!isAiLoading && citedNotes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-indigo-500/20">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-700/80 dark:text-indigo-300/80 mb-2">
                  {t("aiCitedNotes")}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {citedNotes.map((n) => (
                    <NoteCard
                      key={n.id}
                      n={n}
                      dark={dark}
                      openModal={openModal}
                      togglePin={() => {}}
                      multiMode={false}
                      selected={false}
                      onToggleSelect={() => {}}
                      disablePin={true}
                      onDragStart={() => {}}
                      onDragOver={() => {}}
                      onDragLeave={() => {}}
                      onDrop={() => {}}
                      onDragEnd={() => {}}
                      isOnline={isOnline}
                      onUpdateChecklistItem={onUpdateChecklistItem}
                      currentUser={currentUser}
                      maxPreviewItems={4}
                    />
                  ))}
                </div>
              </div>
            )}
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
              onCreateAudio={onDirectAudio}
            />
          ) : !multiMode ? (
            <MobileCreateFab
              open={fabOpen}
              setOpen={setFabOpen}
              onCreateText={onDirectText}
              onCreateChecklist={onDirectChecklist}
              onCreateDraw={onDirectDraw}
              onCreateAudio={onDirectAudio}
            />
          ) : null}
        </div>
      </div>
      )}
    </>
  );
}
