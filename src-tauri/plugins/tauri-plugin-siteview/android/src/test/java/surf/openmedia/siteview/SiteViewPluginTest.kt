package surf.openmedia.siteview

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The script that carries a message from a sign-in window to the page that opened it. */
class SiteViewPluginTest {
    @Test
    fun anObjectMessageReachesThePageAsAMessageEvent() {
        val script = openerMessageScript(JSONObject().put("type", "signed-in"), "https://example.com")
        assertEquals(
            "window.dispatchEvent(new MessageEvent('message',{" +
                "data:{\"type\":\"signed-in\"},origin:\"https://example.com\"}))",
            script,
        )
    }

    @Test
    fun aStringMessageStaysAString() {
        val script = openerMessageScript("done", "https://example.com")
        assertEquals(
            "window.dispatchEvent(new MessageEvent('message',{" +
                "data:\"done\",origin:\"https://example.com\"}))",
            script,
        )
    }

    @Test
    fun aListMessageKeepsItsShape() {
        val script = openerMessageScript(JSONArray().put("a").put(1), "https://example.com")
        assertEquals(
            "window.dispatchEvent(new MessageEvent('message',{" +
                "data:[\"a\",1],origin:\"https://example.com\"}))",
            script,
        )
    }

    @Test
    fun thePageCannotEndTheScriptEarly() {
        val script = openerMessageScript(
            "x');alert(1);//",
            "https://example.com\");alert(2);//",
        )
        assertEquals(
            "window.dispatchEvent(new MessageEvent('message',{" +
                "data:\"x');alert(1);//\"," +
                "origin:\"https://example.com\\\");alert(2);//\"}))",
            script,
        )
    }

    @Test
    fun aMessageThatIsNothingUsableIsNotSent() {
        assertNull(openerMessageScript(null, "https://example.com"))
        assertNull(openerMessageScript(JSONObject.NULL, "https://example.com"))
    }
}
