import { useEffect, useState } from "react";

// Hash-based routing (#/login, #/notes, #/admin...).
export default function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash || "#/login");
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/login");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const navigate = (to) => {
    if (window.location.hash !== to) window.location.hash = to;
    setRoute(to);
  };
  return { route, navigate };
}
