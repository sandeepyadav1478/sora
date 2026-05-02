export const HIGHLIGHT_ICONS: Record<string, { viewBox: string; d: string; fill?: boolean }> = {
  zap:       { viewBox: "0 0 24 24", d: "M13 2 3 14h9l-1 8 10-12h-9l1-8z", fill: true },
  chart:     { viewBox: "0 0 24 24", d: "M3 3v18h18M7 16l4-8 4 4 4-8" },
  users:     { viewBox: "0 0 24 24", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  bot:       { viewBox: "0 0 24 24", d: "M12 8V4H8M2 14a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM9 16h.01M15 16h.01M12 2a2 2 0 0 0-2 2v4h4V4a2 2 0 0 0-2-2z" },
  code:      { viewBox: "0 0 24 24", d: "m16 18 6-6-6-6M8 6l-6 6 6 6" },
  globe:     { viewBox: "0 0 24 24", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z" },
  rocket:    { viewBox: "0 0 24 24", d: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09ZM12 15l-3-3M22 2s-4.37.69-8 4.31L11 10l3 3 3.69-3C21.31 6.37 22 2 22 2Z" },
  target:    { viewBox: "0 0 24 24", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z", fill: true },
  clock:     { viewBox: "0 0 24 24", d: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6v6l4 2" },
  star:      { viewBox: "0 0 24 24", d: "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", fill: true },
  shield:    { viewBox: "0 0 24 24", d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
  database:  { viewBox: "0 0 24 24", d: "M12 2C6.48 2 2 3.79 2 6v12c0 2.21 4.48 4 10 4s10-1.79 10-4V6c0-2.21-4.48-4-10-4ZM2 6c0 2.21 4.48 4 10 4s10-1.79 10-4M2 12c0 2.21 4.48 4 10 4s10-1.79 10-4" },
  cpu:       { viewBox: "0 0 24 24", d: "M6 6h12v12H6zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" },
  download:  { viewBox: "0 0 24 24", d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" },
  trending:  { viewBox: "0 0 24 24", d: "m23 6-9.5 9.5-5-5L1 18M17 6h6v6" },
  award:     { viewBox: "0 0 24 24", d: "M12 2a6 6 0 0 0-6 6c0 5 6 10 6 10s6-5 6-10a6 6 0 0 0-6-6ZM8.21 13.89 7 23l5-3 5 3-1.21-9.12" },
  layers:    { viewBox: "0 0 24 24", d: "m12 2 10 6.5v7L12 22 2 15.5v-7L12 2ZM12 22v-6.5M22 8.5l-10 7-10-7" },
  git:       { viewBox: "0 0 24 24", d: "M12 3v6M12 15v6M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 9a9 9 0 0 0 6 6M18 9a9 9 0 0 1-6 6" },
  check:     { viewBox: "0 0 24 24", d: "M20 6 9 17l-5-5" },
  book:      { viewBox: "0 0 24 24", d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" },
};

export function getHighlightIcon(icon?: string) {
  return HIGHLIGHT_ICONS[icon || "zap"] || HIGHLIGHT_ICONS.zap;
}
