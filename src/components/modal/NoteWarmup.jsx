import React, { Activity, useEffect, useMemo, useState } from "react";

// Steps rendered once after start, each from a note of the user's of that type.
const STEPS = [
  { type: "text", viewMode: true },
  { type: "text", viewMode: false },
  { type: "checklist", viewMode: true },
  { type: "checklist", viewMode: false },
];
const STEP_MS = 400;

// The note modal's ref props: the hidden copy gets its own, so it never points
// the real modal's refs at its elements.
const REF_PROPS = [
  "modalScrollRef", "mBodyRef", "noteViewRef", "modalFileRef", "modalIconFileRef",
  "modalFmtBtnRef", "modalTagInputRef", "modalTagBtnRef", "suppressTagBlurRef",
  "modalColorBtnRef", "scrimClickStartRef", "modalScrollAnchorRef",
];

/**
 * Right after start, renders the note modal once per kind of note and mode,
 * hidden (React's Activity: no effect runs, nothing is shown or fetched), so
 * the first note the user opens is not also the first time that code and the
 * editor run: on a phone that first time cost about three times as much and
 * dropped frames as the note came in. `modal` is the app's note modal element,
 * rendered here with a real note's content in place of the closed state.
 * Stops for good as soon as a note opens.
 */
export default function NoteWarmup({ modal, notes, active }) {
  const [step, setStep] = useState(0);
  const [refs] = useState(() => Object.fromEntries(REF_PROPS.map((name) => [name, React.createRef()])));

  const done = step >= STEPS.length;
  useEffect(() => {
    if (!active || done) return undefined;
    const timer = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [active, done, step]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a real note opened: the warm-up has no reason left to run
    if (!active && step > 0) setStep(STEPS.length);
  }, [active, step]);

  const { type, viewMode } = STEPS[Math.min(step, STEPS.length - 1)];
  const note = useMemo(() => notes.find((n) => n.type === type), [notes, type]);
  if (!active || done || !note) return null;
  return (
    <Activity mode="hidden">
      {React.cloneElement(modal, {
        ...refs,
        open: true,
        isModalClosing: false,
        activeId: note.id,
        activeNoteObj: note,
        mType: note.type,
        mTitle: note.title || "",
        mBody: note.content || "",
        mItems: Array.isArray(note.items) ? note.items : [],
        mImages: Array.isArray(note.images) ? note.images : [],
        mTagList: Array.isArray(note.tags) ? note.tags : [],
        mColor: note.color || "default",
        viewMode,
      })}
    </Activity>
  );
}
