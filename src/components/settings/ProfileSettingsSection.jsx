import React from "react";
import { t } from "../../i18n";
import { api } from "../../utils/api.js";
import { localizeServerError } from "../../utils/serverErrors.js";
import { fileToCompressedDataURL } from "../../utils/images.js";
import UserAvatar from "../common/UserAvatar.jsx";

// Avatar block at the top of the Settings panel: photo upload / removal
// and, inside the Android app, the "change server" shortcut.
export default function ProfileSettingsSection({ currentUser, dark, token, onProfileUpdated, showToast }) {
  const avatarFileRef = React.useRef(null);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataURL(file, 256, 0.85);
      await api("/user/avatar", { method: "PUT", body: { avatar_url: dataUrl }, token });
      onProfileUpdated?.({ avatar_url: dataUrl });
      showToast(t("photoUpdated"), "success", undefined, "camera");
    } catch (err) {
      showToast(localizeServerError(err.message, "uploadFailed"), "error");
    }
    if (avatarFileRef.current) avatarFileRef.current.value = "";
  };

  const handleAvatarRemove = async () => {
    try {
      await api("/user/avatar", { method: "DELETE", token });
      onProfileUpdated?.({ avatar_url: null });
      showToast(t("photoRemoved"), "info", undefined, "camera");
    } catch (err) {
      showToast(localizeServerError(err.message, "removeFailed"), "error");
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center gap-4 mb-4">
        <div className="relative group">
          <UserAvatar
            name={currentUser?.name}
            email={currentUser?.email}
            avatarUrl={currentUser?.avatar_url}
            size="w-16 h-16"
            textSize="text-2xl"
            dark={dark}
          />
          <button
            onClick={() => avatarFileRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{currentUser?.name || currentUser?.email}</div>
          <div className="flex gap-2 mt-1">
            <button
              className="text-xs text-[var(--gk-chrome-accent)] hover:underline"
              onClick={() => avatarFileRef.current?.click()}
            >{currentUser?.avatar_url ? t("changePhoto") : t("uploadPhoto")}</button>
            {currentUser?.avatar_url && (
              <button
                className="text-xs text-red-500 hover:underline"
                onClick={handleAvatarRemove}
              >{t("removePhoto")}</button>
            )}
          </div>
          {window.AndroidTheme && (
            <div className="mt-1">
              <button
                className="text-xs text-[var(--gk-chrome-accent)] hover:underline"
                onClick={() => window.AndroidTheme.changeServer()}
              >{t("changeServer")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
