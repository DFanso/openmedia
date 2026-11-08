import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onChanged: vi.fn(),
  getEntitlement: vi.fn(),
  refreshEntitlement: vi.fn(),
  getOfferings: vi.fn(),
  purchase: vi.fn(),
  restore: vi.fn(),
  changed: undefined as ((view: unknown) => void) | undefined,
}));

vi.mock("./ipc", () => ({
  paywall: {
    onChanged: mocks.onChanged,
    getEntitlement: mocks.getEntitlement,
    refreshEntitlement: mocks.refreshEntitlement,
    getOfferings: mocks.getOfferings,
    purchase: mocks.purchase,
    restore: mocks.restore,
  },
}));

import { resetEntitlementStoreForTests, useEntitlementStore } from "./store";

const free = { status: "free" as const, configured: true, snapshot: null };
const pro = {
  status: "pro" as const,
  configured: true,
  snapshot: {
    active: true,
    productId: "openmedia.pro.monthly",
    inTrial: true,
    expiresAtMs: 1,
    willRenew: true,
  },
};
const monthly = {
  id: "$rc_monthly",
  kind: "monthly" as const,
  productId: "openmedia.pro.monthly",
  price: "$2.00",
  trialDays: 14,
};

beforeEach(() => {
  resetEntitlementStoreForTests();
  mocks.changed = undefined;
  mocks.onChanged.mockImplementation(async (handler: (view: unknown) => void) => {
    mocks.changed = handler;
    return vi.fn();
  });
  mocks.getEntitlement.mockResolvedValue(free);
  mocks.refreshEntitlement.mockResolvedValue(free);
  mocks.getOfferings.mockResolvedValue([monthly]);
  mocks.purchase.mockReset();
  mocks.restore.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe("entitlement state", () => {
  it("keeps startup locked, then mirrors a Pro store update", async () => {
    expect(useEntitlementStore.getState().status).toBe("loading");
    await useEntitlementStore.getState().initialize();
    expect(useEntitlementStore.getState().status).toBe("free");
    mocks.changed?.(pro);
    expect(useEntitlementStore.getState()).toMatchObject(pro);
  });

  it("purchase outcomes update Pro, preserve cancellation, and expose pending approval", async () => {
    await useEntitlementStore.getState().initialize();
    mocks.purchase.mockResolvedValueOnce({ outcome: "cancelled", view: free });
    await expect(useEntitlementStore.getState().purchase(monthly.id)).resolves.toBe("cancelled");
    expect(useEntitlementStore.getState()).toMatchObject({
      status: "free",
      purchasing: null,
      error: null,
    });

    mocks.purchase.mockResolvedValueOnce({ outcome: "pending", view: free });
    await expect(useEntitlementStore.getState().purchase(monthly.id)).resolves.toBe("pending");
    expect(useEntitlementStore.getState().error).toBe("paywall.pending");

    mocks.purchase.mockResolvedValueOnce({ outcome: "purchased", view: pro });
    await expect(useEntitlementStore.getState().purchase(monthly.id)).resolves.toBe("purchased");
    expect(useEntitlementStore.getState().status).toBe("pro");
  });

  it("does not grant Pro when a completed transaction lacks the entitlement", async () => {
    await useEntitlementStore.getState().initialize();
    mocks.purchase.mockResolvedValueOnce({ outcome: "purchased", view: free });
    await expect(useEntitlementStore.getState().purchase(monthly.id)).resolves.toBe("purchased");
    expect(useEntitlementStore.getState()).toMatchObject({
      status: "free",
      error: "paywall.error",
    });
  });

  it("restoring Pro grants access and a restore without a purchase explains the result", async () => {
    await useEntitlementStore.getState().initialize();
    mocks.restore.mockResolvedValueOnce(pro);
    await useEntitlementStore.getState().restore();
    expect(useEntitlementStore.getState()).toMatchObject({
      status: "pro",
      restoring: false,
      error: null,
    });

    mocks.restore.mockResolvedValueOnce(free);
    await useEntitlementStore.getState().restore();
    expect(useEntitlementStore.getState()).toMatchObject({
      status: "free",
      restoring: false,
      error: "paywall.nothingToRestore",
    });
  });

  it("keeps a restore error visible without granting Pro", async () => {
    await useEntitlementStore.getState().initialize();
    mocks.restore.mockRejectedValueOnce("Purchases are not available in this build.");
    await useEntitlementStore.getState().restore();
    expect(useEntitlementStore.getState()).toMatchObject({
      status: "free",
      restoring: false,
      error: "paywall.error",
    });
  });
});
