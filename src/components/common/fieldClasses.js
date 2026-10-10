// Form control looks shared across areas.

// The indigo-to-violet gradient of the primary buttons, without their
// size, spacing and states.
export const GRADIENT_BUTTON_CLASSES =
  "bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-md shadow-indigo-300/40 dark:shadow-none hover:shadow-lg hover:shadow-indigo-300/50 dark:hover:shadow-none hover:scale-[1.03] active:scale-[0.98] btn-gradient";

// Text field of the settings and admin forms.
export const FIELD_INPUT_CLASSES =
  "w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--gk-chrome-accent)] placeholder-gray-500 dark:placeholder-gray-400 text-sm";

// Text field of the sign-in screens.
export const AUTH_INPUT_CLASSES =
  "w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400";

// Full-width gradient submit button (sign-in screens, encryption setup).
export const WIDE_SUBMIT_CLASSES =
  `w-full px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${GRADIENT_BUTTON_CLASSES}`;

// Passphrase field of the instance encryption forms.
export const PASSPHRASE_INPUT_CLASSES =
  "w-full px-3 py-2 rounded-md border border-[var(--border-light)] bg-white/70 dark:bg-gray-800/60";
