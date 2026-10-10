// Server-sent events: splits a fetch response body into its raw frames.
// Frames are separated by a blank line ("\n\n"); parsing the
// `<field>: <value>` lines inside each frame is left to the caller.
export async function* readSseFrames(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      yield frame;
    }
  }
}
