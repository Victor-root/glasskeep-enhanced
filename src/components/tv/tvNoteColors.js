import { parseRGBA } from "../../utils/colors.js";

// Whether a note colour is dark enough to need light text, for the TV
// card and detail viewer.
export function isColorDark(rgba) {
  const { r, g, b } = parseRGBA(rgba);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}
