import React from "react";

/** ---------- Avatar helper (reusable) ---------- */
export default function UserAvatar({ name, email, avatarUrl, size = "w-7 h-7", textSize = "text-xs", dark, className = "" }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || email || "?"}
        className={`${size} rounded-full object-cover select-none ${className}`}
        draggable="false"
      />
    );
  }
  return (
    <span
      className={`flex items-center justify-center ${size} rounded-full ${textSize} font-semibold select-none ${
        dark ? "bg-indigo-500/25 text-indigo-300" : "bg-indigo-100 text-indigo-700"
      } ${className}`}
    >
      {(name?.[0] || email?.[0] || "?").toUpperCase()}
    </span>
  );
}
