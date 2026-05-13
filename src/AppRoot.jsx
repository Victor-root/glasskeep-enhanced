import React from "react";
import App from "./App.jsx";
import TvApp from "./components/tv/TvApp.jsx";
import useTvMode from "./hooks/useTvMode.js";

// Tiny shell that picks the right top-level tree (phone/desktop vs.
// Android TV) at every render. Keeping it as a separate component lets
// App.jsx stay focused on the phone/desktop orchestration without ever
// needing to know about the TV viewer, and lets TvApp own its own
// scoped state without colliding with App's hooks.

export default function AppRoot() {
  const isTv = useTvMode();
  if (isTv) return <TvApp />;
  return <App />;
}
