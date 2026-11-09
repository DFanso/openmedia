import { useState, type CSSProperties, type ReactNode } from "react";
import { useApp } from "../../app/store";
import logoMark from "../../assets/logo-mark.svg";
import { useT } from "../../i18n/useT";
import type { MessageKey } from "../../i18n/messages";
import { HistoryIcon, IncognitoIcon, SlidersIcon, StatsIcon } from "../../shared/icons";
import { useBackHandler } from "../back/useBackHandler";

interface DemoItemStyle extends CSSProperties {
  "--i": number;
  "--from-x": string;
  "--from-y": string;
}

function MiniButton({ pulsing }: { pulsing?: boolean }) {
  return (
    <span className="fab relative grid size-16 place-items-center rounded-full">
      {pulsing && (
        <span className="demo-ring absolute inset-0 rounded-full border-2 border-accent" />
      )}
      <img src={logoMark} alt="" className="relative size-10" />
    </span>
  );
}

function BrandVisual() {
  return (
    <div className="grid size-56 place-items-center">
      <div className="relative grid size-40 place-items-center rounded-[2.5rem] bg-white shadow-[0_20px_60px_rgb(6_175_248/0.25)]">
        <img src={logoMark} alt="" className="size-24" />
      </div>
    </div>
  );
}

function TapVisual() {
  const t = useT();
  return (
    <div className="relative grid size-56 place-items-center">
      <span className="demo-tap absolute size-14 rounded-full border-2 border-accent" />
      <MiniButton />
      <span className="absolute bottom-6 rounded-full border border-hair px-3 py-1 text-xs tracking-[0.14em] text-paper/70 uppercase">
        {t("onboarding.tap")}
      </span>
    </div>
  );
}

/** Offsets from the button's centre, in px. Favorites arc out; the four controls stack above it. */
const DEMO_FAVORITES = [
  { label: "I", x: 70, y: -100 },
  { label: "F", x: 114, y: -50 },
  { label: "T", x: 128, y: 0 },
  { label: "R", x: 114, y: 50 },
  { label: "Y", x: 70, y: 100 },
];

const DEMO_CONTROLS = [
  { key: "incognito", icon: <IncognitoIcon />, y: -188 },
  { key: "usage", icon: <StatsIcon />, y: -146 },
  { key: "history", icon: <HistoryIcon />, y: -104 },
  { key: "settings", icon: <SlidersIcon />, y: -62 },
];

const DEMO_BUTTON_CENTER = { x: 56, y: 214 };

function demoItemStyle(index: number, x: number, y: number, size: number): DemoItemStyle {
  return {
    "--i": index,
    "--from-x": `${-x}px`,
    "--from-y": `${-y}px`,
    left: DEMO_BUTTON_CENTER.x + x - size / 2,
    top: DEMO_BUTTON_CENTER.y + y - size / 2,
    width: size,
    height: size,
  };
}

function HoldVisual() {
  return (
    <div className="relative h-80 w-64">
      <div className="absolute" style={{ left: 24, top: DEMO_BUTTON_CENTER.y - 32 }}>
        <MiniButton pulsing />
      </div>
      {DEMO_FAVORITES.map((item, i) => (
        <span
          key={item.label}
          className="demo-fan-item glass absolute grid place-items-center rounded-full text-base font-medium"
          style={demoItemStyle(i, item.x, item.y, 48)}
        >
          {item.label}
        </span>
      ))}
      {DEMO_CONTROLS.map((item, i) => (
        <span
          key={item.key}
          className="demo-fan-item glass absolute grid place-items-center rounded-full text-paper/70"
          style={demoItemStyle(DEMO_FAVORITES.length + i, 0, item.y, 36)}
        >
          {item.icon}
        </span>
      ))}
    </div>
  );
}

function DragVisual() {
  return (
    <div className="relative h-56 w-56">
      <div className="absolute inset-y-0 right-3 w-px bg-hair" />
      <div className="demo-slide absolute top-1/2 right-0 -mt-7">
        <MiniButton />
      </div>
    </div>
  );
}

interface Step {
  title: MessageKey;
  body: MessageKey;
  visual: ReactNode;
}

const STEPS: Step[] = [
  {
    title: "onboarding.step1Title",
    body: "onboarding.step1Body",
    visual: <BrandVisual />,
  },
  {
    title: "onboarding.step2Title",
    body: "onboarding.step2Body",
    visual: <TapVisual />,
  },
  {
    title: "onboarding.step3Title",
    body: "onboarding.step3Body",
    visual: <HoldVisual />,
  },
  {
    title: "onboarding.step4Title",
    body: "onboarding.step4Body",
    visual: <DragVisual />,
  },
];

/** First-run guide, also reachable from Settings. Full-screen so the page cannot be touched. */
export function Onboarding() {
  const open = useApp((s) => s.onboardingOpen);
  const finishGuide = useApp((s) => s.finishGuide);
  const t = useT();
  const [index, setIndex] = useState(0);
  useBackHandler(open && index > 0, () => setIndex(index - 1));

  if (!open) return null;
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  return (
    <div
      data-hit=""
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.label")}
      className="fixed inset-0 z-[60] flex flex-col bg-ink px-6 pt-[calc(var(--safe-top)+12px)] pb-[calc(var(--safe-bottom)+20px)]"
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void finishGuide()}
          className="px-2 py-3 text-xs tracking-[0.2em] text-paper/60 uppercase"
        >
          {t("onboarding.skip")}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center">{step.visual}</div>

      <div className="min-h-44">
        <p className="text-xs tracking-[0.22em] text-accent uppercase">
          {index + 1} / {STEPS.length}
        </p>
        <h1 className="mt-2 text-4xl leading-[1.05] font-semibold tracking-tight">
          {t(step.title)}
        </h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-paper/65">{t(step.body)}</p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-2" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-accent" : "w-1.5 bg-paper/25"
              }`}
            />
          ))}
        </div>
        <div className="flex gap-3">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="rounded-full border border-hair px-5 py-3 text-base text-paper/80"
            >
              {t("common.back")}
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? void finishGuide() : setIndex(index + 1))}
            className="rounded-full bg-accent px-6 py-3 text-base font-semibold text-on-accent"
          >
            {last ? t("onboarding.start") : t("onboarding.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
