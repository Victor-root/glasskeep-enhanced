/** ---------- Global CSS injection ---------- */
// One module per area, joined in cascade order: later rules rely on
// overriding earlier ones, so the order below must be kept.
import { baseCSS } from "./global/base.js";
import { shellCSS } from "./global/shell.js";
import { notesCSS } from "./global/notes.js";
import { modalButtonsCSS } from "./global/modalButtons.js";
import { modalFooterCSS } from "./global/modalFooter.js";
import { codeAndLinksCSS } from "./global/codeAndLinks.js";
import { scrollbarsCSS } from "./global/scrollbars.js";
import { modalAnimationsCSS } from "./global/modalAnimations.js";
import { sideBySideCSS } from "./global/sideBySide.js";
import { widgetsCSS } from "./global/widgets.js";
import { richTextEditorCSS } from "./global/richTextEditor.js";
import { richTextPopoversCSS } from "./global/richTextPopovers.js";
import { typographyCSS } from "./global/typography.js";
import { richTextCompactCSS } from "./global/richTextCompact.js";
import { aiPanelCSS } from "./global/aiPanel.js";
import { notificationsCSS } from "./global/notifications.js";
import { notificationCenterCSS } from "./global/notificationCenter.js";
import { themedAccentsCSS } from "./global/themedAccents.js";
import { headerCSS } from "./global/header.js";

export const globalCSS = [
  baseCSS,
  shellCSS,
  notesCSS,
  modalButtonsCSS,
  modalFooterCSS,
  codeAndLinksCSS,
  scrollbarsCSS,
  modalAnimationsCSS,
  sideBySideCSS,
  widgetsCSS,
  richTextEditorCSS,
  richTextPopoversCSS,
  typographyCSS,
  richTextCompactCSS,
  aiPanelCSS,
  notificationsCSS,
  notificationCenterCSS,
  themedAccentsCSS,
  headerCSS,
].join("");
