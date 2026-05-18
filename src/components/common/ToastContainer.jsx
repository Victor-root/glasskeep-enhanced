import React from "react";

export default function ToastContainer({ toasts }) {
  if (toasts.length === 0) return null;

  // Layout strategy:
  //  - On mobile (< sm breakpoint), the wrapper spans nearly the full
  //    viewport (left-2 right-2) and each toast takes its full width so
  //    long messages aren't crammed into a 384px column with a third of
  //    the screen wasted on each side. Mobile phones range from ~360px
  //    to ~430px CSS width — the previous `max-w-sm` (384px) capped the
  //    toast and left visible empty gutters on most of them.
  //  - On desktop (sm+), we keep the original centered, content-sized
  //    pill (max-w-sm) so a "Saved" toast doesn't sprawl across half the
  //    screen.
  return (
    <div
      className="fixed left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[60] space-y-2 flex flex-col items-stretch sm:items-center"
      style={{ top: "calc(var(--safe-top) + 1rem)" }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`w-full sm:w-auto sm:max-w-sm px-4 py-2 rounded-lg shadow-lg animate-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-blue-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
