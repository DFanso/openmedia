package surf.openmedia.siteview

import java.io.File
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The vectors in `shared/public-suffix/`, the same ones the Rust, TypeScript and Swift matchers pass. */
class PublicSuffixTest {
    private val shared = File("../../../../shared/public-suffix")

    private fun check(file: String) {
        val vectors = JSONArray(File(shared, file).readText())
        assertTrue(vectors.length() > 0)
        for (i in 0 until vectors.length()) {
            val pair = vectors.getJSONArray(i)
            val expected = if (pair.isNull(1)) null else pair.getString(1)
            assertEquals(pair.getString(0), expected, PublicSuffix.shared.registrableDomain(pair.getString(0)))
        }
    }

    @Test
    fun officialVectors() = check("vectors.json")

    @Test
    fun appVectors() = check("app-vectors.json")

    @Test
    fun theBundledRulesAreTheSharedFile() {
        val text = File(shared, "resources/public_suffix_rules.txt").readText()
        assertEquals("alice.github.io", PublicSuffix(text).registrableDomain("www.alice.github.io"))
    }
}
