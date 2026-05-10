package expo.modules.googlesignin

import android.app.Activity
import android.os.Bundle
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

private object Err {
    const val SIGN_IN_CANCELLED = "ERR_SIGN_IN_CANCELLED"
    const val NO_CREDENTIAL = "ERR_NO_CREDENTIAL"
    const val PLAY_SERVICES_UNAVAILABLE = "ERR_PLAY_SERVICES_UNAVAILABLE"
    const val NOT_CONFIGURED = "ERR_NOT_CONFIGURED"
    const val UNKNOWN = "ERR_UNKNOWN"
}

class ExpoGoogleSigninModule : Module() {
    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var webClientId: String? = null
    private var hostedDomain: String? = null

    override fun definition() = ModuleDefinition {
        Name("ExpoGoogleSignin")

        OnDestroy {
            moduleScope.cancel()
        }

        Function("configure") { options: ConfigureOptions ->
            webClientId = options.webClientId
            hostedDomain = options.hostedDomain
        }

        AsyncFunction("signIn") { options: SignInOptions, promise: Promise ->
            val activity: Activity = appContext.currentActivity
                ?: return@AsyncFunction promise.reject(Err.UNKNOWN, "no foreground activity", null)
            val clientId = webClientId
            if (clientId.isNullOrBlank()) {
                return@AsyncFunction promise.reject(Err.NOT_CONFIGURED, "configure() not called", null)
            }
            val playServices = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity)
            if (playServices != ConnectionResult.SUCCESS) {
                return@AsyncFunction promise.reject(
                    Err.PLAY_SERVICES_UNAVAILABLE,
                    "Google Play Services unavailable (code=$playServices)",
                    null
                )
            }

            val cm = CredentialManager.create(activity)
            val builder = GetSignInWithGoogleOption.Builder(clientId)
            options.nonce?.let { builder.setNonce(it) }
            hostedDomain?.let { builder.setHostedDomainFilter(it) }
            val request = GetCredentialRequest.Builder().addCredentialOption(builder.build()).build()

            moduleScope.launch {
                try {
                    val response = cm.getCredential(activity, request)
                    val cred = response.credential
                    if (cred !is androidx.credentials.CustomCredential ||
                        cred.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                    ) {
                        promise.reject(Err.UNKNOWN, "unexpected credential type: ${cred.type}", null)
                        return@launch
                    }
                    val google = GoogleIdTokenCredential.createFrom(cred.data)
                    promise.resolve(buildResult(google))
                } catch (_: GetCredentialCancellationException) {
                    promise.reject(Err.SIGN_IN_CANCELLED, "user cancelled", null)
                } catch (_: NoCredentialException) {
                    promise.reject(Err.NO_CREDENTIAL, "no Google account available", null)
                } catch (e: Exception) {
                    promise.reject(Err.UNKNOWN, e.message ?: "signIn failed", e)
                }
            }
        }

        AsyncFunction("signOut") { promise: Promise ->
            // signOut works while backgrounded — Application context is sufficient for clearCredentialState (no Activity needed).
            val ctx = appContext.reactContext
                ?: return@AsyncFunction promise.reject(Err.UNKNOWN, "no react context", null)
            val cm = CredentialManager.create(ctx)
            moduleScope.launch {
                try {
                    cm.clearCredentialState(ClearCredentialStateRequest())
                    promise.resolve(null)
                } catch (e: Exception) {
                    promise.reject(Err.UNKNOWN, e.message ?: "signOut failed", e)
                }
            }
        }

        AsyncFunction("getCurrentUser") { promise: Promise ->
            val activity: Activity = appContext.currentActivity
                ?: return@AsyncFunction promise.reject(Err.UNKNOWN, "no foreground activity", null)
            val clientId = webClientId
            if (clientId.isNullOrBlank()) {
                return@AsyncFunction promise.reject(Err.NOT_CONFIGURED, "configure() not called", null)
            }
            val cm = CredentialManager.create(activity)
            // Note: GetGoogleIdOption.Builder in googleid:1.1.1 has no setHostedDomainFilter
            // (the method exists on GetSignInWithGoogleOption.Builder used in signIn). Silent
            // restore relies on setFilterByAuthorizedAccounts(true) — only previously-authorized
            // accounts are returned, so a hostedDomain-gated signIn naturally restricts this path.
            val builder = GetGoogleIdOption.Builder()
                .setServerClientId(clientId)
                .setFilterByAuthorizedAccounts(true)
                .setAutoSelectEnabled(true)
            val request = GetCredentialRequest.Builder().addCredentialOption(builder.build()).build()

            moduleScope.launch {
                try {
                    val response = cm.getCredential(activity, request)
                    val cred = response.credential
                    if (cred !is androidx.credentials.CustomCredential ||
                        cred.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                    ) {
                        promise.resolve(null)
                        return@launch
                    }
                    val google = GoogleIdTokenCredential.createFrom(cred.data)
                    promise.resolve(buildResult(google))
                } catch (_: GetCredentialCancellationException) {
                    promise.resolve(null)
                } catch (_: NoCredentialException) {
                    promise.resolve(null)
                } catch (e: Exception) {
                    promise.reject(Err.UNKNOWN, e.message ?: "getCurrentUser failed", e)
                }
            }
        }
    }

    private fun buildResult(c: GoogleIdTokenCredential): Bundle {
        val sub = JwtDecoder.extractSub(c.idToken) ?: c.id
        // Fallback: c.id is the email, not the OIDC sub. Used only if JWT decode fails.
        val user = Bundle().apply {
            putString("id", sub)
            putString("email", c.id)
            putString("name", c.displayName)
            putString("givenName", c.givenName)
            putString("familyName", c.familyName)
            putString("photo", c.profilePictureUri?.toString())
        }
        return Bundle().apply {
            putString("idToken", c.idToken)
            putBundle("user", user)
        }
    }
}
