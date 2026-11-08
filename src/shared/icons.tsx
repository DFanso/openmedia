import type { ReactNode } from "react";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
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
      {children}
    </svg>
  );
}

export const BackIcon = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ForwardIcon = () => (
  <Icon>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const ReloadIcon = () => (
  <Icon>
    <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ArrowIcon = () => (
  <Icon>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const UpIcon = () => (
  <Icon>
    <path d="M6 14l6-6 6 6" />
  </Icon>
);

export const DownIcon = () => (
  <Icon>
    <path d="M6 10l6 6 6-6" />
  </Icon>
);

export const SlidersIcon = () => (
  <Icon>
    <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="17" r="2" />
  </Icon>
);

export const HistoryIcon = () => (
  <Icon>
    <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5" />
    <path d="M12 8v4.5l3 1.8" />
  </Icon>
);

export const StarIcon = ({ filled = false }: { filled?: boolean }) => (
  <Icon>
    <path
      d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"
      fill={filled ? "currentColor" : "none"}
    />
  </Icon>
);

export const StatsIcon = () => (
  <Icon>
    <path d="M5 20V12M12 20V5M19 20v-5" />
  </Icon>
);

/** A hat and glasses. Active fills the lenses, so the on state reads without color. */
export const IncognitoIcon = ({ active = false, size }: { active?: boolean; size?: number }) => (
  <Icon size={size}>
    <path d="M3 11h18M6 11l1.6-5.3a1 1 0 0 1 1-.7h6.8a1 1 0 0 1 1 .7L18 11" />
    <circle cx="8" cy="16.5" r="2.5" fill={active ? "currentColor" : "none"} />
    <circle cx="16" cy="16.5" r="2.5" fill={active ? "currentColor" : "none"} />
    <path d="M10.5 16.5h3" />
  </Icon>
);

export const LockIcon = () => (
  <Icon>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);
