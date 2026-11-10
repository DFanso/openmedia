package surf.openmedia.billing

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.Package
import com.revenuecat.purchases.PackageType
import com.revenuecat.purchases.PeriodType
import com.revenuecat.purchases.PurchaseParams
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.PurchasesErrorCode
import com.revenuecat.purchases.PurchasesException
import com.revenuecat.purchases.PurchasesTransactionException
import com.revenuecat.purchases.awaitCustomerInfo
import com.revenuecat.purchases.awaitOfferings
import com.revenuecat.purchases.awaitPurchase
import com.revenuecat.purchases.awaitRestore
import com.revenuecat.purchases.interfaces.UpdatedCustomerInfoListener
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

@InvokeArg
class ConfigureArgs {
  lateinit var apiKey: String
  lateinit var entitlementId: String
  lateinit var onEvent: Channel
}

@InvokeArg
class PurchaseArgs {
  lateinit var packageId: String
}

@TauriPlugin
class BillingPlugin(private val activity: Activity) : Plugin(activity) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

  @Volatile
  private var entitlementId: String? = null

  @Volatile
  private var channel: Channel? = null

  @Volatile
  private var configuredApiKey: String? = null

  private val customerInfoListener = UpdatedCustomerInfoListener { info ->
    scope.launch { emitSnapshot(info) }
  }

  @Command
  fun configure(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(ConfigureArgs::class.java)
    } catch (_: Exception) {
      invoke.reject(MSG_INVALID_ARGS)
      return
    }
    entitlementId = args.entitlementId
    channel = args.onEvent
    try {
      if (configuredApiKey != args.apiKey) {
        Purchases.configure(PurchasesConfiguration.Builder(activity, args.apiKey).build())
        configuredApiKey = args.apiKey
      }
      Purchases.sharedInstance.updatedCustomerInfoListener = customerInfoListener
      invoke.resolve(JSObject())
    } catch (_: Exception) {
      invoke.reject(MSG_CONFIGURE)
    }
  }

  @Command
  fun customerInfo(invoke: Invoke) {
    scope.launch {
      try {
        val snapshot = JSObject()
        writeSnapshot(snapshot, Purchases.sharedInstance.awaitCustomerInfo())
        invoke.resolve(snapshot)
      } catch (_: Exception) {
        invoke.reject(MSG_UNAVAILABLE)
      }
    }
  }

  @Command
  fun appUserId(invoke: Invoke) {
    if (!Purchases.isConfigured) {
      invoke.reject(MSG_UNAVAILABLE)
      return
    }
    val result = JSObject()
    result.put("appUserId", Purchases.sharedInstance.appUserID)
    invoke.resolve(result)
  }

  @Command
  fun offerings(invoke: Invoke) {
    scope.launch {
      try {
        val available = Purchases.sharedInstance.awaitOfferings().current?.availablePackages.orEmpty()
        val packages = JSArray()
        CANONICAL_ORDER.forEach { type ->
          val pkg = available.firstOrNull { it.packageType == type } ?: return@forEach
          packages.put(packageObject(pkg))
        }
        val result = JSObject()
        result.put("packages", packages)
        invoke.resolve(result)
      } catch (_: Exception) {
        invoke.reject(MSG_UNAVAILABLE)
      }
    }
  }

  @Command
  fun purchase(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(PurchaseArgs::class.java)
    } catch (_: Exception) {
      invoke.reject(MSG_INVALID_ARGS)
      return
    }
    val type = typeForPackageId(args.packageId)
    if (type == null) {
      invoke.reject(MSG_INVALID_PACKAGE)
      return
    }
    scope.launch {
      try {
        val available = Purchases.sharedInstance.awaitOfferings().current?.availablePackages.orEmpty()
        val pkg = available.firstOrNull { it.packageType == type }
        if (pkg == null) {
          invoke.reject(MSG_UNAVAILABLE)
          return@launch
        }
        val result = Purchases.sharedInstance.awaitPurchase(
          PurchaseParams.Builder(activity, pkg).build()
        )
        val outcome = JSObject()
        outcome.put("outcome", "purchased")
        val snapshot = JSObject()
        writeSnapshot(snapshot, result.customerInfo)
        outcome.put("snapshot", snapshot)
        invoke.resolve(outcome)
      } catch (e: PurchasesTransactionException) {
        if (e.userCancelled || e.code == PurchasesErrorCode.PurchaseCancelledError) {
          invoke.resolve(outcomeOnly("cancelled"))
        } else if (e.code == PurchasesErrorCode.PaymentPendingError) {
          invoke.resolve(outcomeOnly("pending"))
        } else {
          invoke.reject(MSG_PURCHASE)
        }
      } catch (e: PurchasesException) {
        if (e.code == PurchasesErrorCode.PurchaseCancelledError) {
          invoke.resolve(outcomeOnly("cancelled"))
        } else if (e.code == PurchasesErrorCode.PaymentPendingError) {
          invoke.resolve(outcomeOnly("pending"))
        } else {
          invoke.reject(MSG_PURCHASE)
        }
      } catch (_: Exception) {
        invoke.reject(MSG_PURCHASE)
      }
    }
  }

  @Command
  fun restore(invoke: Invoke) {
    scope.launch {
      try {
        val snapshot = JSObject()
        writeSnapshot(snapshot, Purchases.sharedInstance.awaitRestore())
        invoke.resolve(snapshot)
      } catch (_: Exception) {
        invoke.reject(MSG_RESTORE)
      }
    }
  }

  private suspend fun emitSnapshot(info: CustomerInfo) {
    val payload = JSObject()
    payload.put("type", "snapshot")
    writeSnapshot(payload, info)
    channel?.send(payload)
  }

  private fun outcomeOnly(name: String): JSObject {
    val outcome = JSObject()
    outcome.put("outcome", name)
    return outcome
  }

  private fun writeSnapshot(target: JSObject, info: CustomerInfo) {
    val entitlement = entitlementId?.let { info.entitlements[it] }
    target.put("active", entitlement?.isActive == true)
    target.put("productId", entitlement?.productIdentifier ?: JSONObject.NULL)
    target.put("inTrial", entitlement?.periodType == PeriodType.TRIAL)
    target.put("expiresAtMs", entitlement?.expirationDate?.time ?: JSONObject.NULL)
    target.put("willRenew", entitlement?.willRenew == true)
  }

  private fun packageObject(pkg: Package): JSObject {
    val type = pkg.packageType
    val out = JSObject()
    out.put("id", canonicalId(type))
    out.put("kind", kindOf(type))
    out.put("productId", pkg.product.id)
    out.put("price", pkg.product.price.formatted)
    // Play resolves offer eligibility at checkout; the SDK reports unknown for preflight checks.
    out.put("trialDays", JSONObject.NULL)
    return out
  }


  private fun kindOf(type: PackageType): String = when (type) {
    PackageType.MONTHLY -> "monthly"
    PackageType.ANNUAL -> "yearly"
    PackageType.LIFETIME -> "lifetime"
    else -> "unknown"
  }

  private fun canonicalId(type: PackageType): String = when (type) {
    PackageType.MONTHLY -> "\$rc_monthly"
    PackageType.ANNUAL -> "\$rc_annual"
    PackageType.LIFETIME -> "\$rc_lifetime"
    else -> ""
  }

  private fun typeForPackageId(id: String): PackageType? = when (id) {
    "\$rc_monthly" -> PackageType.MONTHLY
    "\$rc_annual" -> PackageType.ANNUAL
    "\$rc_lifetime" -> PackageType.LIFETIME
    else -> null
  }

  private companion object {
    val CANONICAL_ORDER = listOf(PackageType.LIFETIME, PackageType.ANNUAL, PackageType.MONTHLY)
    const val MSG_INVALID_ARGS = "invalid arguments"
    const val MSG_INVALID_PACKAGE = "invalid package"
    const val MSG_CONFIGURE = "billing configuration failed"
    const val MSG_UNAVAILABLE = "billing unavailable"
    const val MSG_PURCHASE = "purchase failed"
    const val MSG_RESTORE = "restore failed"
  }
}
