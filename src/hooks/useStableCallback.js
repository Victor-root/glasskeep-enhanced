import { useCallback, useLayoutEffect, useRef } from "react";

// Returns a function whose identity is STABLE for the component's lifetime
// but which always invokes the latest `fn`. This lets memoized children
// (React.memo) keep bailing out of re-render even when the parent recreates
// its handlers on every render — without the stale-closure risk of
// useCallback dependency lists. (The "useEvent" pattern.)
//
// Why this matters here: the note-card callbacks App.jsx gets from its
// hooks (openModal, togglePin, drag/select/checklist handlers) are
// recreated on every render, so each render would hand NoteCard
// brand-new function references and defeat its
// React.memo — the entire notes grid then re-renders on every modal open
// and every keystroke in the editor. Wrapping the handlers makes their
// identity stable so the memo actually holds.
//
// Only call the returned function from effects/event handlers (after
// commit), never during render — `ref.current` is updated in a layout
// effect, so it always points at the latest closure by the time an event
// fires.
export function useStableCallback(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args) => ref.current(...args), []);
}

export default useStableCallback;
