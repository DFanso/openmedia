import type { Translate } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/messages";
import { HOME_SECTION, OTHER_SECTION } from "./section";

/** The paths that name a well-known part of a site; the rest are shown as the path reads. */
const KNOWN_SECTIONS: Record<string, MessageKey> = {
  watch: "stats.sectionWatch",
  shorts: "stats.sectionShorts",
  live: "stats.sectionLive",
  explore: "stats.sectionExplore",
  search: "stats.sectionSearch",
  notifications: "stats.sectionNotifications",
  messages: "stats.sectionMessages",
  feed: "stats.sectionFeed",
};

export function formatDuration(seconds: number, t: Translate): string {
  if (seconds < 60) return t("stats.durationSeconds", { value: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("stats.durationMinutes", { value: minutes });
  const rest = minutes % 60;
  const hours = Math.floor(minutes / 60);
  return rest === 0
    ? t("stats.durationHours", { value: hours })
    : t("stats.durationHoursMinutes", { value: hours, rest });
}

/** `/watch` reads as "Watch"; the root is "Home" and the catch-all is "Other". */
export function sectionLabel(section: string, t: Translate): string {
  if (section === HOME_SECTION) return t("stats.sectionHome");
  if (section === OTHER_SECTION) return t("stats.sectionOther");
  const word = section.slice(1).replace(/[-_]+/g, " ");
  const known = KNOWN_SECTIONS[word];
  if (known) return t(known);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The local calendar date as `YYYY-MM-DD`, the key usage is stored under. */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
