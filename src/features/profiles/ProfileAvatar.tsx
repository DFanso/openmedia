import { useT } from "../../i18n/useT";
import { Glyph, isGlyph } from "../../shared/glyphs";
import type { Profile } from "../../shared/ipc";
import { shownProfile } from "./profiles";

/**
 * A profile's mark: its icon, else the first letter of its name, in a circle. Without a profile
 * (before the startup state arrives) a person outline.
 */
export function ProfileAvatar({
  profile,
  size,
  framed = false,
}: {
  profile: Pick<Profile, "id" | "name" | "icon"> | null;
  /** The icon's size in pixels; the letter is drawn to match. */
  size: number;
  /** Drawn on its own circle, for lists; the floating button gives it its own. */
  framed?: boolean;
}) {
  const t = useT();
  const mark = !profile ? (
    <Glyph name="user" size={size} />
  ) : isGlyph(profile.icon) ? (
    <Glyph name={profile.icon} size={size} />
  ) : (
    <span
      aria-hidden="true"
      className="leading-none font-semibold uppercase"
      style={{ fontSize: Math.round(size * 0.85) }}
    >
      {[...shownProfile(profile, t).name][0]}
    </span>
  );
  if (!framed) return mark;
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"
    >
      {mark}
    </span>
  );
}
