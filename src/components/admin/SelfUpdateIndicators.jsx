import React from "react";
import TI from "../../icons/editor/index.jsx";

// Progress bar and state icon of the self-update modal header.

export function SelfUpdateProgressBar({ step, total, terminal, success }) {
    const safeTotal = Math.max(1, total || 1);
    const pct =
        terminal && success
            ? 100
            : terminal
              ? Math.min(100, ((step || 0) / safeTotal) * 100)
              : Math.min(100, ((step || 0) / safeTotal) * 100);
    return (
        <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
            <div
                className={`h-full transition-[width] duration-500 ${
                    terminal && !success
                        ? "bg-red-500"
                        : terminal
                          ? "bg-emerald-500"
                          : "bg-indigo-500"
                }`}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

function Spinner() {
    return (
        <span
            className="inline-block w-5 h-5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin"
            aria-hidden="true"
        />
    );
}

export function SelfUpdateStateIcon({ phase }) {
    if (phase === "success") {
        return (
            <span className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                <TI.Check className="tabler-icon w-7 h-7" />
            </span>
        );
    }
    if (phase === "error" || phase === "rolled_back" || phase === "cancelled") {
        return (
            <span
                className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    phase === "error"
                        ? "bg-red-500/15 text-red-600 dark:text-red-300"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                }`}
            >
                <TI.X className="tabler-icon w-7 h-7" />
            </span>
        );
    }
    return (
        <span className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
            <Spinner />
        </span>
    );
}
