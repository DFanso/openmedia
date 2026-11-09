package surf.openmedia.siteview

/**
 * Which site a host belongs to, by the Public Suffix List.
 *
 * The data is `shared/public-suffix/resources/public_suffix_rules.txt`, packaged as a Java resource by this
 * module's Gradle file. The Rust, TypeScript and Swift matchers read the same file, and all of
 * them pass the same vectors.
 */
class PublicSuffix(rulesText: String) {
    private val suffixes = HashSet<String>()
    private val wildcards = HashSet<String>()
    private val exceptions = HashSet<String>()

    init {
        for (line in rulesText.lineSequence()) {
            when {
                line.isEmpty() -> {}
                line.startsWith("!") -> exceptions.add(line.substring(1))
                line.startsWith("*.") -> wildcards.add(line.substring(2))
                else -> suffixes.add(line)
            }
        }
    }

    /**
     * The registrable domain of a host (`news.bbc.co.uk` gives `bbc.co.uk`, `bob.github.io` stays
     * whole), or null for an IP address, a malformed host or a host that is itself a public suffix.
     */
    fun registrableDomain(host: String?): String? {
        val lower = (host ?: "").lowercase()
        val normalized = lower.removeSuffix(".")
        val labels = normalized.split(".")
        if (!labels.all { LABEL.matches(it) }) return null
        if (labels.last().none { it in 'a'..'z' }) return null
        val suffix = suffixLength(labels)
        return if (labels.size > suffix) labels.takeLast(suffix + 1).joinToString(".") else null
    }

    private fun suffixLength(labels: List<String>): Int {
        var longest = 1
        for (start in labels.indices) {
            val candidate = labels.subList(start, labels.size).joinToString(".")
            if (candidate in exceptions) return labels.size - start - 1
            val wildcard = start + 1 < labels.size &&
                labels.subList(start + 1, labels.size).joinToString(".") in wildcards
            val length = labels.size - start
            if ((candidate in suffixes || wildcard) && length > longest) longest = length
        }
        return longest
    }

    companion object {
        private val LABEL = Regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
        private const val RESOURCE = "/public_suffix_rules.txt"

        val shared: PublicSuffix by lazy {
            val stream = PublicSuffix::class.java.getResourceAsStream(RESOURCE)
                ?: error("$RESOURCE is missing from the siteview plugin")
            PublicSuffix(stream.bufferedReader().use { it.readText() })
        }
    }
}
