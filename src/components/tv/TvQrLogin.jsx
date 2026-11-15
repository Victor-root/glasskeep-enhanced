import React from "react";
import { t } from "../../i18n";
import useDeviceLinkLogin, { qrStatusMessage } from "../../auth/useDeviceLinkLogin.js";
import { QrSpinner, CloseGlyph, CheckGlyph } from "../auth/QrGlyphs.jsx";

// The TV's card for the QR sign-in, the desktop's flow laid out for a
// screen: the code on the left, big enough to scan from the couch, what
// to do and where it stands on the right. Typing a password with a
// remote is the slow way in; this one asks for none.
export default function TvQrLogin({ onLoggedIn, onCancel, cancelRef }) {
  const { status, qrDataUrl, errorText, secondsLeft, generate } = useDeviceLinkLogin(onLoggedIn);
  const message = qrStatusMessage(status, errorText, secondsLeft);
  const spent = status === "expired" || status === "rejected";

  return (
    <div className="tv-login__card tv-qr">
      <div className={`tv-qr__code${qrDataUrl ? "" : " tv-qr__code--empty"}`}>
        {status === "loading" && <QrSpinner size="w-10 h-10" />}
        {status !== "loading" && !qrDataUrl && <CloseGlyph large />}
        {qrDataUrl && (
          <img src={qrDataUrl} alt="QR code" draggable="false" className={spent ? "tv-qr__img--spent" : ""} />
        )}
        {qrDataUrl && spent && <div className="tv-qr__overlay"><CloseGlyph large /></div>}
        {status === "approved" && <div className="tv-qr__overlay tv-qr__overlay--ok"><CheckGlyph /></div>}
      </div>
      <div className="tv-qr__side">
        <div className="tv-login__title">{t("qrLoginTitle")}</div>
        <p className="tv-qr__explain">{t("qrLoginExplain")}</p>
        {message && (
          <p className={`tv-qr__status tv-qr__status--${message.tone}`}>
            {message.text}
            {message.countdown && ` · ${message.countdown}`}
          </p>
        )}
        <div className="tv-qr__actions">
          {(spent || status === "error") && (
            <button
              type="button"
              className="tv-btn tv-btn--primary tv-login__submit tv-focusable tv-focusable--flat"
              onClick={generate}
            >
              {t("qrLoginRegenerate")}
            </button>
          )}
          <button
            ref={cancelRef}
            type="button"
            className="tv-btn tv-login__submit tv-focusable tv-focusable--flat"
            onClick={onCancel}
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
