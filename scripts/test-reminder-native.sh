#!/usr/bin/env bash
# =============================================================================
#  GlassKeep — fire a NATIVE reminder notification on demand (debug APK)
#
#  Raises a real reminder notification on a connected Android device right
#  now, exactly as a due AlarmManager alarm would, so you can test the
#  notification's look and its tap / "Open" deep-link WITHOUT scheduling a
#  reminder and waiting for it.
#
#  How it works: it broadcasts to ReminderDebugReceiver, a test-only
#  receiver that exists solely in DEBUG builds (android/app/src/debug). It
#  is NOT present in any release APK, so this only works on a debug build
#  (./gradlew assembleDebug — the APK you've been sideloading for tests).
#
#  Unlike the server-side scripts/test-reminder.cjs (which drives the
#  in-app card + Web Push through the server), this hits the on-device
#  native path — the one that fires when the app is CLOSED — which the
#  server can't reach on its own.
#
#  Prerequisites:
#    - adb installed on this machine (the LXC):  apt install adb
#    - the phone reachable over adb. Two options:
#        USB:       plug in, enable USB debugging, `adb devices`
#        Wireless:  on the phone enable Wireless debugging, then from here
#                   `adb connect <phone-ip>:5555`  (or the port it shows)
#      Your LXC and phone must be on the same network for wireless.
#
#  Usage:
#    scripts/test-reminder-native.sh [noteId] [title] [body]
#
#  Examples:
#    scripts/test-reminder-native.sh                       # uses the defaults below
#    scripts/test-reminder-native.sh 1777374322541-t1vpuv
#    scripts/test-reminder-native.sh 1777374322541-t1vpuv "Courses" "Acheter du lait"
#
#  Env:
#    ADB_SERIAL   target a specific device (value of `adb devices`); else the
#                 only connected device is used.
#    ADB          path to the adb binary (default: adb on PATH)
# =============================================================================
set -euo pipefail

ADB_BIN="${ADB:-adb}"
NOTE_ID="${1:-1777374322541-t1vpuv}"
TITLE="${2:-Rappel de test}"
BODY="${3:-Touchez pour ouvrir la note}"

PKG="com.glasskeep.app"
RECEIVER="$PKG/.reminders.ReminderDebugReceiver"

if ! command -v "$ADB_BIN" >/dev/null 2>&1; then
  echo "[error] adb not found. Install it (e.g. 'apt install adb') or set \$ADB." >&2
  exit 1
fi

# -s <serial> only when ADB_SERIAL is set, so the common single-device case
# Just Works without extra config.
SERIAL_ARGS=()
if [ -n "${ADB_SERIAL:-}" ]; then
  SERIAL_ARGS=(-s "$ADB_SERIAL")
fi

# Fail clearly if nothing is connected, instead of a cryptic adb error.
if ! "$ADB_BIN" "${SERIAL_ARGS[@]}" get-state >/dev/null 2>&1; then
  echo "[error] no device connected. Plug in over USB, or 'adb connect <phone-ip>:5555' for wireless." >&2
  "$ADB_BIN" devices >&2 || true
  exit 1
fi

echo "[*] Firing native reminder on device for note '$NOTE_ID'…"
"$ADB_BIN" "${SERIAL_ARGS[@]}" shell am broadcast \
  -n "$RECEIVER" \
  --es noteId "$NOTE_ID" \
  --es title "$TITLE" \
  --es body "$BODY"

echo "[ok] Broadcast sent. Check the phone:"
echo "     - the notification should appear immediately (even with the app open);"
echo "     - tapping it (or 'Ouvrir') should open note $NOTE_ID."
echo
echo "If you get 'Broadcast completed: result=0' but no notification, make sure"
echo "you installed the DEBUG apk and granted it notification permission."
