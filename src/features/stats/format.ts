import { HOME_SECTION, OTHER_SECTION } from "./section";

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 60)}h ${rest}m`;
}

/** `/watch` reads as "Watch"; the root is "Home" and the catch-all is "Other". */
export function sectionLabel(section: string): string {
  if (section === HOME_SECTION) return "Home";
  if (section === OTHER_SECTION) return "Other";
  const word = section.slice(1).replace(/[-_]+/g, " ");
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The local calendar date as `YYYY-MM-DD`, the key usage is stored under. */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
