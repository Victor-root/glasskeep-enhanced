import { useEffect, useState } from "react";
import { api } from "../utils/api.js";

// What the sign-in screens show before anyone is signed in: whether new
// accounts are allowed, the login slogan and the accounts listed on the
// login screen. Fetched once at boot.
export default function usePublicLoginInfo() {
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [loginSlogan, setLoginSlogan] = useState("");
  const [loginProfiles, setLoginProfiles] = useState([]);
  // Every answer is in (or failed): the sign-in card can show.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const registration = (async () => {
      try {
        const response = await api("/admin/allow-registration");
        setAllowRegistration(response.allowNewAccounts);
      } catch (e) {
        console.error("Failed to check registration setting:", e);
        setAllowRegistration(false);
      }
    })();
    const slogan = (async () => {
      try {
        const response = await api("/admin/login-slogan");
        setLoginSlogan(response.loginSlogan || "");
      } catch (e) {
        console.error("Failed to fetch login slogan:", e);
      }
    })();
    const profiles = (async () => {
      try {
        const profiles = await api("/login/profiles");
        setLoginProfiles(Array.isArray(profiles) ? profiles : []);
      } catch (e) {
        console.error("Failed to fetch login profiles:", e);
        setLoginProfiles([]);
      }
    })();
    Promise.all([registration, slogan, profiles]).then(() => setLoaded(true));
  }, []);

  return { allowRegistration, loginSlogan, setLoginSlogan, loginProfiles, loaded };
}
