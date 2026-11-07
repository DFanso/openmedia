import type { ReactNode } from "react";

export const field =
  "w-full min-w-0 rounded-xl border border-hair bg-paper/[0.05] px-3 py-2.5 text-base text-paper outline-none placeholder:text-paper/35 focus:border-accent";

export const primaryButton =
  "rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent disabled:opacity-40";

export const quietButton =
  "rounded-full border border-hair px-4 py-2 text-sm font-medium text-paper/85 disabled:opacity-40";

interface SectionProps {
  title: string;
  /** Explains the group below it, in small print. */
  note?: ReactNode;
  children: ReactNode;
}

/** A titled block of settings. The title is small and quiet; the controls carry the weight. */
export function Section({ title, note, children }: SectionProps) {
  return (
    <section>
      <h2 className="px-1 pb-2 text-xs font-semibold tracking-[0.16em] text-paper/50 uppercase">
        {title}
      </h2>
      {children}
      {note && <p className="px-1 pt-2.5 text-[13px] leading-snug text-paper/50">{note}</p>}
    </section>
  );
}

/** One rounded card whose rows are separated by hairlines. */
export function Group({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-paper/[0.04]">
      {children}
    </div>
  );
}

/** A small label above a group, for blocks inside a section. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="px-1 pt-1 pb-2 text-[13px] font-medium text-paper/60">{children}</h3>;
}
