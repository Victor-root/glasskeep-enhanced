import { useEffect, useState } from "react";

// Live viewport size, for the responsive layout decisions taken in JS.
export default function useWindowSize() {
  // Read once: window.innerWidth makes the browser lay out a changed page
  // first, and an initial value written inline is evaluated on every render.
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return { windowWidth, windowHeight };
}
