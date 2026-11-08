interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A full-width row with a label on the left and a switch on the right; sits inside a `Group`. */
export function Switch({ label, description, checked, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left active:bg-paper/[0.05]"
    >
      <span className="min-w-0">
        <span className="block text-base">{label}</span>
        {description && (
          <span className="mt-0.5 block text-sm leading-snug text-paper/55">{description}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-paper/20"
        }`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full transition-all ${
            checked ? "left-[22px] bg-on-accent" : "left-0.5 bg-paper/70"
          }`}
        />
      </span>
    </button>
  );
}
