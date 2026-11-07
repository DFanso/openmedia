import type { ReactNode } from "react";
import { CloseIcon } from "./icons";

interface ScreenProps {
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/** A full-screen page: a large title over a scrolling body, so nothing from the site shows through. */
export function Screen({ title, subtitle, closeLabel, onClose, children }: ScreenProps) {
  return (
    <div data-hit="" className="screen fixed inset-0 z-50 flex flex-col bg-ink">
      <header className="flex items-end justify-between gap-4 border-b border-hair px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-4">
        <div className="min-w-0">
          <h1 className="text-[2rem] leading-none font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 truncate text-sm text-paper/55">{subtitle}</p>}
        </div>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-paper/[0.08] text-paper/80 active:bg-paper/[0.16]"
        >
          <CloseIcon />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+40px)]">
        {children}
      </div>
    </div>
  );
}
