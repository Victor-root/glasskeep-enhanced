import React from "react";

export function useDark() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark"));
  React.useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
