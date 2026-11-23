import { useEffect } from "react";

// Sets an attribute on <html> while `active`, for page-wide CSS. Counted per
// attribute, so one holder letting go does not clear it under another.
const holders = new Map();

export default function useRootFlag(attribute, active) {
  useEffect(() => {
    if (!active) return undefined;
    holders.set(attribute, (holders.get(attribute) || 0) + 1);
    document.documentElement.setAttribute(attribute, "");
    return () => {
      const left = holders.get(attribute) - 1;
      holders.set(attribute, left);
      if (left === 0) document.documentElement.removeAttribute(attribute);
    };
  }, [attribute, active]);
}
