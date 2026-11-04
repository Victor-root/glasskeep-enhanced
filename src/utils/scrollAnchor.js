// Read and edit render the same blocks at slightly different heights, so a
// scroll position means nothing from one to the other. The block at the top of
// the screen does: it is what the reader was looking at.

const blocksOf = (scroller) => [...(scroller.querySelector(".note-content")?.children ?? [])];

// Layout position, not on-screen rects: the content fades in with a transform.
function topIn(scroller, el) {
  let top = 0;
  for (let n = el; n && n !== scroller; n = n.offsetParent) top += n.offsetTop;
  return top;
}

export function captureScrollAnchor(scroller) {
  const blocks = blocksOf(scroller);
  const header = scroller.querySelector(":scope > .sticky");
  const edge = header ? header.getBoundingClientRect().bottom : scroller.getBoundingClientRect().top;
  const index = blocks.findIndex((b) => b.getBoundingClientRect().bottom > edge);
  if (index < 0) return null;
  const rect = blocks[index].getBoundingClientRect();
  if (rect.top >= edge && scroller.scrollTop === 0) return null;
  const offset = edge - rect.top;
  return { index, offset, share: offset / rect.height, view: edge - scroller.getBoundingClientRect().top };
}

export function restoreScrollAnchor(scroller, anchor) {
  const block = blocksOf(scroller)[anchor.index];
  if (!block) return;
  const offset = anchor.offset < 0 ? anchor.offset : anchor.share * block.offsetHeight;
  scroller.scrollTop = topIn(scroller, block) + offset - anchor.view;
}
