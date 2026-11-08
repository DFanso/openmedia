import RevenueCat
import SwiftRs
import Tauri
import UIKit
import WebKit

class ConfigureArgs: Decodable {
  let apiKey: String
  let entitlementId: String
  let onEvent: Channel
}

class PurchaseArgs: Decodable {
  let packageId: String
}

struct Snapshot: Encodable {
  let active: Bool
  let productId: String?
  let inTrial: Bool
  let expiresAtMs: Int64?
  let willRenew: Bool
}

struct SnapshotEvent: Encodable {
  let type = "snapshot"
  let active: Bool
  let productId: String?
  let inTrial: Bool
  let expiresAtMs: Int64?
  let willRenew: Bool

  init(_ snapshot: Snapshot) {
    active = snapshot.active
    productId = snapshot.productId
    inTrial = snapshot.inTrial
    expiresAtMs = snapshot.expiresAtMs
    willRenew = snapshot.willRenew
  }
}

struct PackageView: Encodable {
  let id: String
  let kind: String
  let productId: String
  let price: String
  let trialDays: Int?
}

struct OfferingsView: Encodable {
  let packages: [PackageView]
}

struct SimulatorView: Encodable {
  let isSimulator: Bool
}

struct PurchaseView: Encodable {
  let outcome: String
  let snapshot: Snapshot?
}

private let purchaseFailed = "purchase failed"
private let notConfigured = "billing is not configured"

class BillingPlugin: Plugin {
  private var entitlementId: String?
  private var events: Channel?
  private var streamTask: Task<Void, Never>?

  @objc public func isSimulator(_ invoke: Invoke) throws {
    #if targetEnvironment(simulator)
      invoke.resolve(SimulatorView(isSimulator: true))
    #else
      invoke.resolve(SimulatorView(isSimulator: false))
    #endif
  }

  @objc public func configure(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ConfigureArgs.self)
    guard !args.apiKey.isEmpty, !args.entitlementId.isEmpty else {
      invoke.reject("billing is not configured")
      return
    }
    entitlementId = args.entitlementId
    events = args.onEvent
    if !Purchases.isConfigured {
      Purchases.configure(
        with: Configuration.Builder(withAPIKey: args.apiKey)
          .with(storeKitVersion: .storeKit2)
          .build())
    }
    if streamTask == nil {
      streamTask = Task { [weak self] in
        for await info in Purchases.shared.customerInfoStream {
          guard let self, let entitlementId = self.entitlementId else { return }
          try? self.events?.send(SnapshotEvent(Self.snapshot(info, entitlementId)))
        }
      }
    }
    invoke.resolve()
  }

  @objc public func customerInfo(_ invoke: Invoke) throws {
    guard let entitlementId, Purchases.isConfigured else {
      invoke.reject(notConfigured)
      return
    }
    Task {
      do {
        let info = try await Purchases.shared.customerInfo()
        invoke.resolve(Self.snapshot(info, entitlementId))
      } catch {
        invoke.reject("could not read purchase status")
      }
    }
  }

  @objc public func offerings(_ invoke: Invoke) throws {
    guard Purchases.isConfigured else {
      invoke.reject(notConfigured)
      return
    }
    Task {
      do {
        let offerings = try await Purchases.shared.offerings()
        guard let offering = offerings.current else {
          invoke.resolve(OfferingsView(packages: []))
          return
        }
        let ordered: [(Package?, String, String)] = [
          (offering.lifetime, "$rc_lifetime", "lifetime"),
          (offering.annual, "$rc_annual", "yearly"),
          (offering.monthly, "$rc_monthly", "monthly"),
        ]
        var packages: [PackageView] = []
        for (package, id, kind) in ordered {
          guard let package else { continue }
          let product = package.storeProduct
          packages.append(
            PackageView(
              id: id,
              kind: kind,
              productId: product.productIdentifier,
              price: product.localizedPriceString,
              trialDays: await Self.trialDays(product)))
        }
        invoke.resolve(OfferingsView(packages: packages))
      } catch {
        invoke.reject("could not load plans")
      }
    }
  }

  @objc public func purchase(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(PurchaseArgs.self)
    guard let entitlementId, Purchases.isConfigured else {
      invoke.reject(notConfigured)
      return
    }
    Task {
      do {
        let offerings = try await Purchases.shared.offerings()
        guard
          let package = offerings.current?.availablePackages.first(where: {
            $0.identifier == args.packageId
          })
        else {
          invoke.reject("plan not available")
          return
        }
        let result = try await Purchases.shared.purchase(package: package)
        if result.userCancelled {
          invoke.resolve(PurchaseView(outcome: "cancelled", snapshot: nil))
        } else {
          invoke.resolve(
            PurchaseView(
              outcome: "purchased",
              snapshot: Self.snapshot(result.customerInfo, entitlementId)))
        }
      } catch let error as ErrorCode {
        Self.rejectPurchase(invoke, error)
      } catch {
        invoke.reject(purchaseFailed)
      }
    }
  }

  @objc public func restore(_ invoke: Invoke) throws {
    guard let entitlementId, Purchases.isConfigured else {
      invoke.reject(notConfigured)
      return
    }
    Task {
      do {
        let info = try await Purchases.shared.restorePurchases()
        invoke.resolve(Self.snapshot(info, entitlementId))
      } catch {
        invoke.reject("could not restore purchases")
      }
    }
  }

  private static func rejectPurchase(_ invoke: Invoke, _ code: ErrorCode) {
    switch code {
    case .purchaseCancelledError:
      invoke.resolve(PurchaseView(outcome: "cancelled", snapshot: nil))
    case .paymentPendingError:
      invoke.resolve(PurchaseView(outcome: "pending", snapshot: nil))
    default:
      invoke.reject(purchaseFailed)
    }
  }

  private static func snapshot(_ info: CustomerInfo, _ entitlementId: String) -> Snapshot {
    let entitlement = info.entitlements[entitlementId]
    return Snapshot(
      active: entitlement?.isActive == true,
      productId: entitlement?.productIdentifier,
      inTrial: entitlement?.periodType == .trial,
      expiresAtMs: entitlement?.expirationDate.map { Int64($0.timeIntervalSince1970 * 1000) },
      willRenew: entitlement?.willRenew == true)
  }

  private static func trialDays(_ product: StoreProduct) async -> Int? {
    guard let discount = product.introductoryDiscount, discount.paymentMode == .freeTrial else {
      return nil
    }
    let status = await Purchases.shared.checkTrialOrIntroDiscountEligibility(product: product)
    guard status == .eligible else { return nil }
    let period = discount.subscriptionPeriod
    let perUnit: Int
    switch period.unit {
    case .day: perUnit = 1
    case .week: perUnit = 7
    case .month: perUnit = 30
    case .year: perUnit = 365
    @unknown default: return nil
    }
    return perUnit * period.value
  }
}

@_cdecl("init_plugin_billing")
public func initPlugin() -> Plugin {
  return BillingPlugin()
}
