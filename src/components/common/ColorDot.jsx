import React from "react";
import { trColorName, solid, bgFor } from "../../utils/colors.js";

export const ColorDot = ({ name, selected, onClick, darkMode }) => (
  <button
    type="button"
    onClick={onClick}
    data-tooltip={trColorName(name)}
    aria-label={trColorName(name)}
    className={`w-6 h-6 rounded-full border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${name === "default" ? "flex items-center justify-center" : ""} ${selected ? "ring-2 ring-indigo-500" : ""}`}
    style={{
      backgroundColor:
        name === "default" ? "transparent" : solid(bgFor(name, darkMode)),
      borderColor: name === "default" ? "#d1d5db" : "transparent",
    }}
  >
    {name === "default" && (
      <div
        className="w-4 h-4 rounded-full"
        style={{ backgroundColor: darkMode ? "#1f2937" : "#fff" }}
      />
    )}
  </button>
);
