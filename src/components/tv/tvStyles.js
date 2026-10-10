// CSS injected when the app boots in Android TV mode.
//
// Gated entirely on `<html data-tv="1">`.
// Assembled from one module per area, in cascade order.

import { tvBaseCSS } from "./styles/base.js";
import { tvLayoutCSS } from "./styles/layout.js";
import { tvNoteCardCSS } from "./styles/noteCard.js";
import { tvNoteDetailCSS } from "./styles/noteDetail.js";
import { tvLoginCSS } from "./styles/login.js";
import { tvLightThemeCSS } from "./styles/lightTheme.js";

export const TV_STYLE_ID = "tv-mode-styles";

export const TV_CSS = [
  tvBaseCSS,
  tvLayoutCSS,
  tvNoteCardCSS,
  tvNoteDetailCSS,
  tvLoginCSS,
  tvLightThemeCSS,
].join("");
