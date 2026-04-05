import React from "react";

export default function ToastContainer({ toasts }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] space-y-2 flex flex-col items-center">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-2 rounded-lg shadow-lg max-w-sm animate-in slide-in-from-top-2 ${
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
