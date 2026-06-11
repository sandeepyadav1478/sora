// Dedup by envelope id (first occurrence wins), then sort newest-first by date.
export function dedupAndSort(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  unique.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return unique;
}
