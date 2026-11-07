package dev.openmedia.siteview

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Bitmap
import android.os.Message
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ProfileStore
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class RectArgs {
  var x: Double = 0.0
  var y: Double = 0.0
  var width: Double = 0.0
  var height: Double = 0.0
}

@InvokeArg
class OpenArgs {
  lateinit var profile: String
  lateinit var url: String
  lateinit var rect: RectArgs
  var documentStartScript: String? = null
  lateinit var onEvent: Channel
}

@InvokeArg
class SetRectArgs {
  lateinit var rect: RectArgs
}

@InvokeArg
class SetVisibleArgs {
  var visible: Boolean = true
}

@InvokeArg
class NavigateArgs {
  lateinit var url: String
}

@InvokeArg
class DeleteProfileDataArgs {
  lateinit var profile: String
}

private const val BRIDGE_NAME = "openmedia"
private val ALLOWED_SCHEMES = setOf("http", "https")

private fun profileName(id: String) = "om_" + id.replace('-', '_')

private fun isWebUrl(url: String?): Boolean {
  val uri = android.net.Uri.parse(url ?: return false)
  return uri.scheme?.lowercase() in ALLOWED_SCHEMES && !uri.host.isNullOrEmpty()
}

/**
 * Hosts one native WebView above the Tauri shell webview. The shell owns layout and reports the
 * rectangle in CSS pixels; the site view never receives Tauri IPC, only the write-only
 * `openmedia` bridge delivered through addWebMessageListener.
 */
@TauriPlugin
class SiteViewPlugin(private val activity: Activity) : Plugin(activity) {
  private var shell: WebView? = null
  private var siteView: WebView? = null
  private var events: Channel? = null

  private val density get() = activity.resources.displayMetrics.density

  private val backCallback = object : OnBackPressedCallback(false) {
    override fun handleOnBackPressed() {
      siteView?.takeIf { it.canGoBack() }?.goBack()
    }
  }

  override fun load(webView: WebView) {
    shell = webView
    (activity as? AppCompatActivity)?.onBackPressedDispatcher?.addCallback(backCallback)
  }

  @Command
  fun open(invoke: Invoke) {
    val args = invoke.parseArgs(OpenArgs::class.java)
    if (!isWebUrl(args.url)) {
      invoke.reject("only http and https urls can be opened")
      return
    }
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
      invoke.reject("this Android System WebView cannot isolate profiles; update it")
      return
    }
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      invoke.reject("this Android System WebView does not support the message bridge; update it")
      return
    }
    activity.runOnUiThread {
      val params = layoutParams(args.rect)
      if (params == null) {
        invoke.reject("shell webview is not ready")
        return@runOnUiThread
      }
      tearDown()
      val view = createSiteView(args)
      activity.addContentView(view, params)
      siteView = view
      events = args.onEvent
      backCallback.isEnabled = true
      view.loadUrl(args.url)
      invoke.resolve()
    }
  }

  @Command
  fun close(invoke: Invoke) {
    activity.runOnUiThread {
      tearDown()
      invoke.resolve()
    }
  }

  @Command
  fun setRect(invoke: Invoke) {
    val args = invoke.parseArgs(SetRectArgs::class.java)
    onSiteView(invoke) { view ->
      layoutParams(args.rect)?.let { view.layoutParams = it }
    }
  }

  @Command
  fun setVisible(invoke: Invoke) {
    val args = invoke.parseArgs(SetVisibleArgs::class.java)
    onSiteView(invoke) { it.visibility = if (args.visible) View.VISIBLE else View.GONE }
  }

  @Command
  fun navigate(invoke: Invoke) {
    val args = invoke.parseArgs(NavigateArgs::class.java)
    if (!isWebUrl(args.url)) {
      invoke.reject("only http and https urls can be opened")
      return
    }
    onSiteView(invoke) { it.loadUrl(args.url) }
  }

  @Command
  fun goBack(invoke: Invoke) = onSiteView(invoke) { if (it.canGoBack()) it.goBack() }

  @Command
  fun goForward(invoke: Invoke) = onSiteView(invoke) { if (it.canGoForward()) it.goForward() }

  @Command
  fun reload(invoke: Invoke) = onSiteView(invoke) { it.reload() }

  @Command
  fun deleteProfileData(invoke: Invoke) {
    val args = invoke.parseArgs(DeleteProfileDataArgs::class.java)
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
      invoke.reject("this Android System WebView cannot isolate profiles; update it")
      return
    }
    activity.runOnUiThread {
      if (siteView != null) tearDown()
      ProfileStore.getInstance().deleteProfile(profileName(args.profile))
      invoke.resolve()
    }
  }

  @SuppressLint("SetJavaScriptEnabled", "RequiresFeature")
  private fun createSiteView(args: OpenArgs): WebView {
    val view = WebView(activity)
    view.settings.javaScriptEnabled = true
    view.settings.domStorageEnabled = true
    view.settings.setSupportMultipleWindows(true)

    ProfileStore.getInstance().getOrCreateProfile(profileName(args.profile))
    WebViewCompat.setProfile(view, profileName(args.profile))

    val origins = setOf("*")
    WebViewCompat.addWebMessageListener(
      view,
      BRIDGE_NAME,
      origins,
      { _: WebView, message: WebMessageCompat, sourceOrigin: android.net.Uri, isMainFrame: Boolean, _: JavaScriptReplyProxy ->
        val body = message.data
        if (isMainFrame && body != null) {
          send(JSObject().put("type", "bridge").put("origin", sourceOrigin.toString()).put("body", body))
        }
      },
    )

    val script = args.documentStartScript
    var lateScript: String? = null
    if (!script.isNullOrEmpty()) {
      if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
        WebViewCompat.addDocumentStartJavaScript(view, script, origins)
      } else {
        lateScript = script
      }
    }

    view.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        !isWebUrl(request.url.toString())

      override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        lateScript?.let { view.evaluateJavascript(it, null) }
        sendState(view, loading = true)
      }

      override fun onPageFinished(view: WebView, url: String?) = sendState(view, loading = false)

      override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) =
        sendState(view, loading = view.progress < 100)

      override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) {
          send(JSObject().put("type", "error").put("message", error.description.toString()))
        }
      }
    }

    view.webChromeClient = object : WebChromeClient() {
      override fun onReceivedTitle(view: WebView, title: String?) = sendState(view, loading = view.progress < 100)

      override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
        val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
        val popup = WebView(activity)
        popup.webViewClient = object : WebViewClient() {
          override fun shouldOverrideUrlLoading(popup: WebView, request: WebResourceRequest): Boolean {
            if (isWebUrl(request.url.toString())) view.loadUrl(request.url.toString())
            return true
          }
        }
        transport.webView = popup
        resultMsg.sendToTarget()
        return true
      }
    }
    return view
  }

  private fun sendState(view: WebView, loading: Boolean) {
    send(
      JSObject()
        .put("type", "state")
        .put("url", view.url)
        .put("title", view.title)
        .put("loading", loading)
        .put("canGoBack", view.canGoBack())
        .put("canGoForward", view.canGoForward()),
    )
  }

  private fun send(data: JSObject) {
    events?.send(data)
  }

  private fun tearDown() {
    siteView?.let {
      (it.parent as? ViewGroup)?.removeView(it)
      it.destroy()
    }
    siteView = null
    events = null
    backCallback.isEnabled = false
  }

  private fun onSiteView(invoke: Invoke, action: (WebView) -> Unit) {
    activity.runOnUiThread {
      val view = siteView
      if (view == null) {
        invoke.reject("no site view is open")
        return@runOnUiThread
      }
      action(view)
      invoke.resolve()
    }
  }

  private fun layoutParams(rect: RectArgs): FrameLayout.LayoutParams? {
    val shellView = shell ?: return null
    val content = activity.findViewById<View>(android.R.id.content) ?: return null
    val shellAt = IntArray(2).also { shellView.getLocationInWindow(it) }
    val contentAt = IntArray(2).also { content.getLocationInWindow(it) }
    return FrameLayout.LayoutParams((rect.width * density).toInt(), (rect.height * density).toInt()).apply {
      leftMargin = shellAt[0] - contentAt[0] + (rect.x * density).toInt()
      topMargin = shellAt[1] - contentAt[1] + (rect.y * density).toInt()
    }
  }
}
