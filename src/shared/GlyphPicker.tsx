import type { ReactNode } from "react";
import { useT } from "../i18n/useT";
import { GLYPHS, Glyph, isGlyph } from "./glyphs";

interface GlyphPickerProps {
  label: string;
  /** The icon chosen; anything that is not a drawn icon counts as none. */
  value: string | undefined;
  onChange: (icon: string | undefined) => void;
  /** The first choice, no icon of its own: what the item shows without one. */
  none: { label: string; content: ReactNode };
}

/** A grid of the drawn icons a folder or a profile can carry, with "none" first. */
export function GlyphPicker({ label, value, onChange, none }: GlyphPickerProps) {
  const t = useT();
  const current = isGlyph(value) ? value : undefined;
  const choice = (selected: boolean) =>
    `grid size-11 place-items-center rounded-xl border ${
      selected
        ? "border-accent bg-accent/15 text-accent"
        : "border-hair bg-paper/[0.04] text-paper/85"
    }`;

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={current === undefined}
        aria-label={none.label}
        title={none.label}
        onClick={() => onChange(undefined)}
        className={choice(current === undefined)}
      >
        {none.content}
      </button>
      {GLYPHS.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={current === name}
          aria-label={t(`glyph.${name}`)}
          title={t(`glyph.${name}`)}
          onClick={() => onChange(name)}
          className={choice(current === name)}
        >
          <Glyph name={name} size={22} />
        </button>
      ))}
    </div>
  );
}
