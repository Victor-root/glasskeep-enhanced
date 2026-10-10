import React from "react";
import { t } from "../../i18n";
import { LogOutIcon } from "../../icons/index.jsx";
import UserAvatar from "../common/UserAvatar.jsx";

// Desktop sign-out, two-step in place: the first click "arms" the account
// button (the avatar crossfades into a red logout glyph and the pseudo
// turns red) and the second click signs out. It disarms on an outside
// click or after a few idle seconds so it never gets stuck. This keeps the
// header clean (no bare logout icon) while making room for the lock button.
// Mobile keeps sign-out in the kebab menu.
export default function HeaderAccountButton({ dark, currentUser, signOut }) {
  const [signOutArmed, setSignOutArmed] = React.useState(false);
  const userBtnRef = React.useRef(null);
  const signOutDisarmTimerRef = React.useRef(null);

  React.useEffect(() => {
    if (!signOutArmed) return undefined;
    // Auto-disarm after a short idle window.
    signOutDisarmTimerRef.current = setTimeout(() => setSignOutArmed(false), 3500);
    // Disarm on any pointer-down outside the account button.
    const onDown = (e) => {
      if (userBtnRef.current?.contains(e.target)) return;
      setSignOutArmed(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clearTimeout(signOutDisarmTimerRef.current);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [signOutArmed]);

  return (
    <button
      ref={userBtnRef}
      type="button"
      onClick={() => {
        if (signOutArmed) { signOut?.(); return; }
        setSignOutArmed(true);
      }}
      className={`flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 transition-colors duration-200 focus:outline-none focus:ring-2 ${
        signOutArmed
          ? "bg-red-500/10 hover:bg-red-500/[0.15] focus:ring-red-400"
          : "hover:bg-black/5 dark:hover:bg-white/10 focus:ring-indigo-500"
      }`}
      aria-label={signOutArmed ? t("signOut") : (currentUser?.name || currentUser?.email)}
      data-tooltip={signOutArmed ? t("signOut") : undefined}
    >
      {/* Fixed-size slot: avatar and logout glyph are layered and
          crossfade + scale between the two states for a smooth swap. */}
      <span className="relative w-7 h-7 shrink-0">
        <span
          className="absolute inset-0 transition-all duration-300 ease-out"
          style={{
            opacity: signOutArmed ? 0 : 1,
            transform: signOutArmed ? "scale(0.8)" : "scale(1)",
          }}
          aria-hidden={signOutArmed}
        >
          <UserAvatar
            name={currentUser?.name}
            email={currentUser?.email}
            avatarUrl={currentUser?.avatar_url}
            size="w-7 h-7"
            textSize="text-xs"
            dark={dark}
          />
        </span>
        <span
          className="absolute inset-0 flex items-center justify-center text-red-500 dark:text-red-400 transition-all duration-300 ease-out pointer-events-none"
          style={{
            opacity: signOutArmed ? 1 : 0,
            transform: signOutArmed ? "scale(1)" : "scale(0.8)",
          }}
          aria-hidden={!signOutArmed}
        >
          <LogOutIcon />
        </span>
      </span>
      <span
        className={`text-sm font-medium transition-colors duration-200 ${
          signOutArmed
            ? "text-red-500 dark:text-red-400"
            : (dark ? "text-gray-200" : "text-gray-700")
        }`}
      >
        {currentUser?.name || currentUser?.email}
      </span>
    </button>
  );
}
