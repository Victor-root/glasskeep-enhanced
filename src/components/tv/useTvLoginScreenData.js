import { useEffect, useState } from "react";
import { api } from "../../utils/api.js";

// What the TV login screen shows while signed out: the admin's slogan and
// the public profiles to pick from.
export default function useTvLoginScreenData(token) {
  // Public login slogan — set by the server admin, refreshed whenever
  // the login screen is on display. Empty string when unset; TvLogin
  // hides the slogan pill entirely in that case.
  const [loginSlogan, setLoginSlogan] = useState("");
  useEffect(() => {
    if (token) return; // only fetched while the user is signed out
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/admin/login-slogan");
        if (!cancelled) setLoginSlogan(res?.loginSlogan || "");
      } catch {
        if (!cancelled) setLoginSlogan("");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Public login profiles (Jellyfin-style avatar list). Lets users sign
  // in by picking their face + typing the password — no email required,
  // which matters because the original phone account may not have one.
  const [loginProfiles, setLoginProfiles] = useState([]);
  useEffect(() => {
    if (token) return; // already signed in, profiles list is irrelevant
    let cancelled = false;
    (async () => {
      try {
        const profiles = await api("/login/profiles");
        if (cancelled) return;
        setLoginProfiles(Array.isArray(profiles) ? profiles : []);
      } catch {
        if (!cancelled) setLoginProfiles([]);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return { loginSlogan, loginProfiles };
}
