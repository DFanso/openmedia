import { useState } from "react";
import { useT } from "../../i18n/useT";
import { useBackHandler } from "../back/useBackHandler";
import { CheckIcon } from "../../shared/icons";
import { field } from "./ui";

export interface PickerOption {
  value: string;
  label: string;
}

interface PickerProps {
  /** Names the control for screen readers and titles the list. */
  label: string;
  value: string;
  options: readonly PickerOption[];
  onChange: (value: string) => void;
}

/**
 * A choice from a list. A native `<select>` opens the system's own light dialog on Android, which
 * ignores the app's theme, so the list is drawn here instead.
 */
export function Picker({ label, value, options, onChange }: PickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  useBackHandler(open, close);
  const selected = options.find((option) => option.value === value);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`${field} flex items-center justify-between gap-3 text-start`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <span aria-hidden="true" className="text-paper/45">
          ⌄
        </span>
      </button>
      {open && (
        <div data-hit="" className="fixed inset-0 z-[70] flex flex-col justify-end">
          <button
            type="button"
            aria-label={t("common.cancel")}
            onClick={close}
            className="absolute inset-0 bg-black/55"
          />
          <div
            role="listbox"
            aria-label={label}
            className="screen relative flex max-h-[70%] flex-col overflow-hidden rounded-t-3xl border-t border-hair bg-ink"
          >
            <div className="px-5 pt-5 pb-3 text-sm font-semibold text-paper/60">{label}</div>
            <div className="divide-y divide-hair overflow-y-auto overscroll-contain pb-[calc(var(--safe-bottom)+12px)]">
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      close();
                      if (!active) onChange(option.value);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-5 py-3.5 text-start text-base active:bg-paper/[0.08] ${
                      active ? "font-semibold text-accent" : "text-paper"
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {active && <CheckIcon />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
