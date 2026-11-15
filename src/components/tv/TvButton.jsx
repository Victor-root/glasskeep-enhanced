import React, { forwardRef } from "react";

// The TV viewer's clickable control, in place of <button>. Each time a
// <button> takes the focus, the Android WebView goes over the whole page
// (on the form controls' behalf): 10 to 15 ms per D-pad move with two
// hundred notes on the emulator, far more on a TV box, and a quarter of a
// second when the rail opens and the grid has to be laid out again for
// it. A div with the button role takes the focus in under a millisecond.
// OK on the remote clicks it (useSpatialFocus).
const TvButton = forwardRef(function TvButton(props, ref) {
  return <div ref={ref} role="button" tabIndex={0} {...props} />;
});

export default TvButton;
