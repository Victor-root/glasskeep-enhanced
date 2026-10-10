import React, { useEffect, useState } from "react";

// Date+time line as its own subtree. The 30s tick used to live on
// TvNotesViewer, which made the whole tree re-render every half
// minute: masonry diff + memo bust on every card check. Isolated
// here it costs literally one text node update per tick.
export default function TvHeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return <div className="tv-header__subtitle">{dateStr} · {timeStr}</div>;
}
