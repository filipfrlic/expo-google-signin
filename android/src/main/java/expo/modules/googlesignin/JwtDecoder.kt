package expo.modules.googlesignin

import android.util.Base64
import android.util.Log
import org.json.JSONObject

object JwtDecoder {
    fun extractSub(idToken: String): String? {
        val parts = idToken.split(".")
        if (parts.size < 2) return null
        return try {
            val payload = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP))
            JSONObject(payload).optString("sub", "").takeIf { it.isNotEmpty() }
        } catch (e: Exception) {
            Log.w("ExpoGoogleSignin", "Failed to extract sub claim from idToken; falling back to email", e)
            null
        }
    }
}
