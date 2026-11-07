const FADE_MS = 250;

export function hideSplash(): void {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.setAttribute("data-hidden", "");
  window.setTimeout(() => splash.remove(), FADE_MS);
}
