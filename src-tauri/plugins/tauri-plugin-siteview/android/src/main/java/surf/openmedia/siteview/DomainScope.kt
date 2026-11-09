package surf.openmedia.siteview

/**
 * What to do with a main-frame navigation requested by a session.
 *
 * This is the Android twin of `ios/Sources/DomainScope.swift`: a session never leaves its domain,
 * and the rule is kept in plain functions so it can be read (and tested) without a WebView.
 */
object DomainScope {
    enum class Verdict {
        ALLOW,
        CANCEL,
        POPUP,
    }

    /**
     * `www.instagram.com` and `m.instagram.com` both give `instagram.com`; `news.bbc.co.uk` gives
     * `bbc.co.uk`, and `bob.github.io` stays `bob.github.io` (Public Suffix List). Hosts without a
     * registrable part (IP addresses, `localhost`) are kept whole.
     */
    @JvmStatic
    fun registrableDomain(host: String?): String =
        PublicSuffix.shared.registrableDomain(host) ?: (host ?: "").removeSuffix(".").lowercase()

    /** True for the scope itself and any subdomain of it, never for `notinstagram.com`. */
    @JvmStatic
    fun contains(scope: String, host: String): Boolean {
        val normalizedHost = host.removeSuffix(".").lowercase()
        val normalizedScope = scope.removeSuffix(".").lowercase()
        if (normalizedScope.isEmpty()) return false
        return normalizedHost == normalizedScope || normalizedHost.endsWith("." + normalizedScope)
    }

    /**
     * Decides a navigation.
     *
     * `settled` is false until the session's first load has finished. Until then a redirect to
     * another domain (`twitter.com` to `x.com`) is the site finding its own home, so it is
     * allowed and the session adopts the final domain. Subframes are never blocked; only the page
     * the user sees is pinned.
     */
    @JvmStatic
    fun verdict(
        scheme: String?,
        host: String?,
        scope: String,
        settled: Boolean,
        isMainFrame: Boolean,
    ): Verdict {
        return when (scheme?.lowercase()) {
            "about" -> Verdict.ALLOW
            "http", "https" -> {
                if (host.isNullOrEmpty()) {
                    Verdict.CANCEL
                } else if (!isMainFrame || !settled || contains(scope, host)) {
                    Verdict.ALLOW
                } else {
                    Verdict.POPUP
                }
            }
            else -> Verdict.CANCEL
        }
    }
}
