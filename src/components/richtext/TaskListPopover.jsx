import React, { useEffect, useState } from "react";
import { t } from "../../i18n";
import { Popover } from "./Popover.jsx";
import {
  getActiveTaskStrike,
  setTaskStrike,
  TASK_STRIKE_EVENT,
} from "../../theme/taskListStrike.js";

// Per-device "strike through checked items" preference for task lists.
// Mirrors the live <html> class so every open toolbar (e.g. split mode)
// stays in sync no matter which one flipped it.
function useTaskStrike() {
  const [on, setOn] = useState(() => getActiveTaskStrike());
  useEffect(() => {
    const sync = () => setOn(getActiveTaskStrike());
    document.addEventListener(TASK_STRIKE_EVENT, sync);
    return () => document.removeEventListener(TASK_STRIKE_EVENT, sync);
  }, []);
  return [on, setTaskStrike];
}

// Chevron popover attached to the task-list button. Holds the single
// "Strike through checked items" display option. The preference is a
// per-device reading setting (see theme/taskListStrike.js): it never
// touches the note content or adds a Strike mark.
export default function TaskListPopover({ anchorRef, open, onClose }) {
  const [strike, update] = useTaskStrike();
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} className="rt-pop--task">
      <div className="rt-pop-label">{t("fmtTaskListOptions")}</div>
      <label className="rt-pop-check">
        <input
          type="checkbox"
          checked={strike}
          onChange={(e) => update(e.target.checked)}
        />
        <span>{t("fmtTaskListStrikeChecked")}</span>
      </label>
    </Popover>
  );
}
