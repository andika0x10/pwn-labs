// Wrangler Tail dapat menghasilkan JSON rapat atau multiline, dengan banner di awal.
export function traceEvents(text) {
  const events = [];
  let depth = 0, start = 0, quoted = false, escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"' && depth) { quoted = true; continue; }
    if (char === '{') {
      if (!depth) start = index;
      depth++;
    } else if (char === '}' && depth && !--depth) {
      try { events.push(JSON.parse(text.slice(start, index + 1))); }
      catch { /* Abaikan bagian banner yang bukan objek JSON. */ }
    }
  }
  return events;
}
