import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** What the store says about the entitlement right now. */
export type EntitlementStatus = "loading" | "free" | "pro";

export interface EntitlementSnapshot {
  active: boolean;
  productId: string | null;
  inTrial: boolean;
  expiresAtMs: number | null;
  willRenew: boolean;
}

export interface EntitlementView {
  status: EntitlementStatus;
  /** False when the app has no store key, so nothing can be bought. */
  configured: boolean;
  snapshot: EntitlementSnapshot | null;
}

export type PackageKind = "monthly" | "yearly" | "lifetime";

export interface Package {
  id: string;
  kind: PackageKind;
  productId: string;
  /** Already localized by the store; never build prices in the UI. */
  price: string;
  trialDays: number | null;
}

export type PurchaseOutcome = "purchased" | "cancelled" | "pending";

export interface PurchaseResultView {
  outcome: PurchaseOutcome;
  view: EntitlementView;
}

/** The shell event carrying the current entitlement. */
export const ENTITLEMENT_CHANGED = "entitlement:changed";

/** The stable code Rust sends when a command needs Pro. */
export const PRO_REQUIRED = "pro-required";

/** True when a command was refused because the user is not Pro. */
export function isProRequired(error: unknown): boolean {
  return typeof error === "string" && error.trim() === PRO_REQUIRED;
}

/**
 * The paywall's own commands. They live beside the feature that uses them: the store key and the
 * customer id never reach the shell.
 */
export const paywall = {
  getEntitlement: () => invoke<EntitlementView>("get_entitlement"),
  refreshEntitlement: () => invoke<EntitlementView>("refresh_entitlement"),
  getOfferings: () => invoke<Package[]>("get_offerings"),
  purchase: (packageId: string) => invoke<PurchaseResultView>("purchase_package", { packageId }),
  restore: () => invoke<EntitlementView>("restore_purchases"),
  onChanged: (handler: (view: EntitlementView) => void): Promise<UnlistenFn> =>
    listen<EntitlementView>(ENTITLEMENT_CHANGED, (event) => handler(event.payload)),
};
