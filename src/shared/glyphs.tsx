import type { ReactNode } from "react";

const dot = (cx: number, cy: number, r = 1) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

/**
 * The icons a folder or a profile can be given, drawn like the app's own icons rather than
 * emoji. Rust stores only the name (`library::is_icon_name`); a name missing here draws nothing.
 */
const DRAWINGS = {
  folder: (
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  ),
  star: <path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  heart: (
    <path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" />
  ),
  home: <path d="M4 11l8-6.5 8 6.5M6 9.5v10h12v-10M10 19.5v-5h4v5" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.2a5.5 5.5 0 0 1 3 4.8" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3.5 12.5h17" />
    </>
  ),
  school: <path d="M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5V16c3 2.5 8 2.5 11 0v-4.5M21.5 9.5v5" />,
  book: <path d="M5 19V6a2 2 0 0 1 2-2h12v13H7a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h12v-4" />,
  news: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5" />
    </>
  ),
  chat: <path d="M20 11.5a7.5 7 0 0 1-10.6 6.4L4 19.5l1.5-4.2A7.5 7 0 1 1 20 11.5z" />,
  code: <path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14" />,
  film: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4" />
    </>
  ),
  music: (
    <>
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </>
  ),
  game: (
    <>
      <rect x="3" y="7.5" width="18" height="10" rx="5" />
      <path d="M8 10.5v4M6 12.5h4" />
      {dot(15.5, 11.5)}
      {dot(17.5, 13.5)}
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.9 1.5-1.9-.4-1.2.4-2.1 1.6-2.1h1.9a3.5 3.5 0 0 0 3.5-3.5c0-5.3-3.8-9.5-8.5-9.5z" />
      {dot(7.5, 11.5)}
      {dot(9.5, 7.5)}
      {dot(14.5, 7.5)}
    </>
  ),
  cart: (
    <>
      <path d="M3.5 4.5h2.2l2 10.5h10.3l1.8-7.5H6.6" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="16.5" cy="19" r="1.4" />
    </>
  ),
  money: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      {dot(6.5, 12)}
      {dot(17.5, 12)}
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="4" rx="1" />
      <path d="M5.5 13v7h13v-7M12 9v11M12 9C10.5 6 7 5.5 7 7.8 7 9 9.5 9 12 9zm0 0c1.5-3 5-3.5 5-1.2C17 9 14.5 9 12 9z" />
    </>
  ),
  food: (
    <path d="M7 3.5v6a2 2 0 0 0 2 2v9M11 3.5v6a2 2 0 0 1-2 2M9 3.5v5M16.5 20.5v-17c-2 1-3 3.5-3 6.5v4h3" />
  ),
  coffee: (
    <path d="M5 9.5h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5V6M11 3.5V6M14 3.5V6" />
  ),
  plane: (
    <path d="M12 3c.8 0 1.3.8 1.3 1.8v4.7l7.2 4.2v1.8l-7.2-2.2v4.3l2 1.6V21L12 20l-3.3 1v-1.8l2-1.6v-4.3l-7.2 2.2v-1.8l7.2-4.2V4.8C10.7 3.8 11.2 3 12 3z" />
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5M12 3.5C9.5 6 8.5 9 8.5 12s1 6 3.5 8.5" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8l3.3 2.4-1.3 3.9h-4l-1.3-3.9zM12 3.5V8M15.3 10.4l4.6-1.6M14 14.3l2.8 3.9M10 14.3l-2.8 3.9M8.7 10.4L4.1 8.8" />
    </>
  ),
  dumbbell: <path d="M6.5 7.5v9M17.5 7.5v9M4 10v4M20 10v4M6.5 12h11" />,
  leaf: <path d="M5 19c0-9 5-14.5 14.5-14.5C19.5 14 14 19 5 19zM5 19l8-8" />,
  paw: (
    <>
      <path d="M12 12.5c-2.5 0-4.5 3-4.5 5 0 1.4 1 2 2.2 2 1 0 1.5-.5 2.3-.5s1.3.5 2.3.5c1.2 0 2.2-.6 2.2-2 0-2-2-5-4.5-5z" />
      <circle cx="6.2" cy="11.2" r="1.4" />
      <circle cx="9.2" cy="7" r="1.4" />
      <circle cx="14.8" cy="7" r="1.4" />
      <circle cx="17.8" cy="11.2" r="1.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" />,
  bolt: <path d="M13 3.5l-7.5 10H12l-1 7 7.5-10H12z" />,
  brain: (
    <path d="M12 5.5v13M12 5.5a3 3 0 0 0-5.5 1.2A3 3 0 0 0 4.5 11a3 3 0 0 0 1 4.5A3 3 0 0 0 9 19a3 3 0 0 0 3-.5M12 5.5a3 3 0 0 1 5.5 1.2 3 3 0 0 1 2 4.3 3 3 0 0 1-1 4.5A3 3 0 0 1 15 19a3 3 0 0 1-3-.5" />
  ),
  flask: (
    <path d="M9.5 3.5h5M10.5 3.5V9L5 18a1.8 1.8 0 0 0 1.5 2.5h11A1.8 1.8 0 0 0 19 18l-5.5-9V3.5M7.5 14.5h9" />
  ),
  wrench: (
    <path d="M15 4.5a4.5 4.5 0 0 0-4.2 6.1l-6.3 6.3a1.8 1.8 0 0 0 2.6 2.6l6.3-6.3A4.5 4.5 0 0 0 19.5 9l-2.8 2.8-2.6-.9-.9-2.6L16 5.6a4.5 4.5 0 0 0-1-1.1z" />
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  shield: <path d="M12 3.5l7 2.5v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" />,
} satisfies Record<string, ReactNode>;

export type GlyphName = keyof typeof DRAWINGS;

/** Every icon, in the order the pickers offer them. */
export const GLYPHS = Object.keys(DRAWINGS) as GlyphName[];

/** Whether a stored icon is one drawn here; anything else (an emoji, an unknown name) is no icon. */
export const isGlyph = (name: string | null | undefined): name is GlyphName =>
  typeof name === "string" && Object.prototype.hasOwnProperty.call(DRAWINGS, name);

export function Glyph({ name, size = 20 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {DRAWINGS[name]}
    </svg>
  );
}
