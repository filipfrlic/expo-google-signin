package expo.modules.googlesignin

import android.util.Base64
import android.util.Log
import org.json.JSONObject

/**
 * Reads claims out of an ID token *without verifying its signature*.
 *
 * The token arrives straight from Credential Manager, so this is a convenience
 * for claims the credential object does not expose — never authentication.
 * Backends must still verify any token they are handed.
 */
object JwtDecoder {
    private const val TAG = "ExpoGoogleSignin"

    fun decodePayload(idToken: String): JSONObject? {
        val parts = idToken.split(".")
        if (parts.size < 2) return null
        return try {
            val payload = String(
                Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
            )
            JSONObject(payload)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to decode idToken payload", e)
            null
        }
    }

    fun extractSub(idToken: String): String? =
        decodePayload(idToken)?.optString("sub", "")?.takeIf { it.isNotEmpty() }

    /**
     * Whether the token's `hd` claim equals [hostedDomain].
     *
     * Fails closed: a token that will not decode does not pass a domain gate.
     */
    fun matchesHostedDomain(idToken: String, hostedDomain: String): Boolean =
        decodePayload(idToken)?.optString("hd", "") == hostedDomain
}
