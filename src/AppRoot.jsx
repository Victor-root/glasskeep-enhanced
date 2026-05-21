import React from "react";
import App from "./App.jsx";
import TvApp from "./components/tv/TvApp.jsx";
import useTvMode from "./hooks/useTvMode.js";
import { NotificationProvider } from "./components/notifications/NotificationProvider.jsx";

// Tiny shell that picks the right top-level tree (phone/desktop vs.
// Android TV) at every render. Keeping it as a separate component lets
// App.jsx stay focused on the phone/desktop orchestration without ever
// needing to know about the TV viewer, and lets TvApp own its own
// scoped state without colliding with App's hooks.
//
// NotificationProvider wraps both branches so any component in either
// tree can call useNotifications() without caring which tree it lives
// in. Toasts shown in the phone/desktop tree don't surface in the TV
// tree at the same time because TvApp doesn't render the viewport.

export default function AppRoot() {
  const isTv = useTvMode();
  return (
    <NotificationProvider>
      {isTv ? <TvApp /> : <App />}
    </NotificationProvider>
  );
}
