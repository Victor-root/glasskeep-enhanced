// Geometry of the panels that drop from a button with an arrow pointing
// back at it (ColorPickerPanel, LogoPickerPopover, the note modal's tag
// dropdown): where the arrow sits, and the corner it squares off when it
// comes close to the panel's edge.

/** The arrow's offset from the panel's left edge, centred on the anchor. */
export function anchoredArrowLeft(anchorRect, panelLeft) {
  return anchorRect.left + anchorRect.width / 2 - panelLeft - 6;
}

/** The panel's arrow position and squared corner, as inline style.
 *  `nearRightFrom` is the arrow offset past which it counts as near the
 *  right edge. */
export function anchoredArrowStyle(arrowLeft, arrowDir, nearRightFrom) {
  const nearLeft = arrowLeft < 20;
  const nearRight = arrowLeft > nearRightFrom;
  return {
    '--arrow-left': `${arrowLeft}px`,
    ...(nearLeft && arrowDir === "up" && { borderTopLeftRadius: '4px' }),
    ...(nearLeft && arrowDir === "down" && { borderBottomLeftRadius: '4px' }),
    ...(nearRight && arrowDir === "up" && { borderTopRightRadius: '4px' }),
    ...(nearRight && arrowDir === "down" && { borderBottomRightRadius: '4px' }),
  };
}
