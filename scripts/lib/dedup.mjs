// Dedup by envelope id (first occurrence wins), then sort newest-first by date.
export function dedupAndSort(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  unique.sort((a, b) => {
    const da = Date.parse(b.date);
    const db = Date.parse(a.date);
    return (isNaN(da) ? Infinity : da) - (isNaN(db) ? Infinity : db) || 0;
  });
  return unique;
}
