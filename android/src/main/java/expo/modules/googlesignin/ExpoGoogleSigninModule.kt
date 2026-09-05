package expo.modules.googlesignin

import android.accounts.Account
import android.app.Activity
import android.content.IntentSender
import android.os.Bundle
import android.util.Log
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.Scope
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

private const val AUTHORIZE_REQUEST_CODE = 0x6753

/** AccountManager type for Google accounts. */
private const val GOOGLE_ACCOUNT_TYPE = "com.google"

private const val TAG = "ExpoGoogleSignin"

class ExpoGoogleSigninModule : Module() {
    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var webClientId: String? = null
    private var hostedDomain: String? = null

    // Held while the consent UI is in front; resolved from OnActivityResult.
    // Written on the caller's thread, read on main — hence @Volatile.
    @Volatile
    private var pendingAuthorize: Promise? = null

    // The account the in-flight consent UI was pinned to, checked against the
    // account that actually granted when the result comes back.
    @Volatile
    private var pendingAuthorizeAccount: String? = null

    // Email of the last account that signed in, used to pin authorize() to the
    // same account. In-memory only, so a process restart clears it — authorize()
    // then recovers it silently from Credential Manager rather than running
    // unpinned, and refuses outright if it cannot.
    @Volatile
    private var lastAccountEmail: String? = null

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
                    lastAccountEmail = google.id
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

        // Credential Manager issues ID tokens only; OAuth scopes and access tokens
        // come from AuthorizationClient, which may need its own consent UI.
        AsyncFunction("authorize") { options: AuthorizeOptions, promise: Promise ->
            val activity: Activity = appContext.currentActivity
                ?: return@AsyncFunction promise.reject(Err.UNKNOWN, "no foreground activity", null)
            if (options.scopes.isEmpty()) {
                return@AsyncFunction promise.reject(
                    Err.UNKNOWN,
                    "authorize() requires at least one scope",
                    null
                )
            }
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

            moduleScope.launch {
                // Consent must be pinned to a known account: unpinned, the picker
                // can hand back a token for a different account than signIn()
                // returned, and nothing in the result would tell the caller.
                // lastAccountEmail is in-memory, so recover it silently after a
                // process restart rather than authorizing blind.
                val account = lastAccountEmail ?: recoverAccountEmail(activity, clientId)
                if (account == null) {
                    promise.reject(
                        Err.NO_CREDENTIAL,
                        "authorize() requires a signed-in user — call signIn() first",
                        null
                    )
                    return@launch
                }
                lastAccountEmail = account

                val builder = AuthorizationRequest.builder()
                    .setRequestedScopes(options.scopes.map { Scope(it) })
                    .setAccount(Account(account, GOOGLE_ACCOUNT_TYPE))
                hostedDomain?.let { builder.filterByHostedDomain(it) }
                val request = builder.build()

                Identity.getAuthorizationClient(activity)
                    .authorize(request)
                    .addOnSuccessListener { result ->
                        if (!result.hasResolution()) {
                            // Scopes already granted — no UI needed.
                            resolveAuthorization(result, account, promise)
                            return@addOnSuccessListener
                        }
                        val pendingIntent = result.pendingIntent
                        if (pendingIntent == null) {
                            promise.reject(
                                Err.UNKNOWN,
                                "authorization needs consent but no PendingIntent was returned",
                                null
                            )
                            return@addOnSuccessListener
                        }
                        // A second authorize() while one is in flight abandons the first.
                        pendingAuthorize?.reject(Err.UNKNOWN, "superseded by another authorize() call", null)
                        pendingAuthorize = promise
                        pendingAuthorizeAccount = account
                        try {
                            activity.startIntentSenderForResult(
                                pendingIntent.intentSender,
                                AUTHORIZE_REQUEST_CODE,
                                null,
                                0,
                                0,
                                0
                            )
                        } catch (e: IntentSender.SendIntentException) {
                            pendingAuthorize = null
                            pendingAuthorizeAccount = null
                            promise.reject(Err.UNKNOWN, e.message ?: "could not launch consent UI", e)
                        }
                    }
                    .addOnFailureListener { e ->
                        promise.reject(Err.UNKNOWN, e.message ?: "authorize failed", e)
                    }
            }
        }

        OnActivityResult { activity, payload ->
            if (payload.requestCode != AUTHORIZE_REQUEST_CODE) return@OnActivityResult
            val promise = pendingAuthorize ?: return@OnActivityResult
            val account = pendingAuthorizeAccount
            pendingAuthorize = null
            pendingAuthorizeAccount = null
            if (payload.resultCode != Activity.RESULT_OK) {
                promise.reject(Err.SIGN_IN_CANCELLED, "user cancelled authorization", null)
                return@OnActivityResult
            }
            try {
                val result = Identity.getAuthorizationClient(activity)
                    .getAuthorizationResultFromIntent(payload.data)
                resolveAuthorization(result, account, promise)
            } catch (e: Exception) {
                promise.reject(Err.UNKNOWN, e.message ?: "authorize failed", e)
            }
        }

        AsyncFunction("signOut") { promise: Promise ->
            // signOut works while backgrounded — Application context is sufficient for clearCredentialState (no Activity needed).
            val ctx = appContext.reactContext
                ?: return@AsyncFunction promise.reject(Err.UNKNOWN, "no react context", null)
            val cm = CredentialManager.create(ctx)
            lastAccountEmail = null
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
            moduleScope.launch {
                try {
                    val google = silentCredential(activity, clientId)
                    if (google == null) {
                        promise.resolve(null)
                        return@launch
                    }
                    // GetGoogleIdOption.Builder in googleid:1.1.1 has no
                    // setHostedDomainFilter (the method exists only on the
                    // GetSignInWithGoogleOption.Builder that signIn uses), and
                    // setFilterByAuthorizedAccounts(true) only means "has used this
                    // app before" — which an account that predates the hostedDomain
                    // setting still satisfies. So gate on the token's own hd claim.
                    if (!hostedDomainMatches(google.idToken)) {
                        promise.resolve(null)
                        return@launch
                    }
                    lastAccountEmail = google.id
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

    /** True when no hostedDomain is configured, or the token's `hd` claim matches it. */
    private fun hostedDomainMatches(idToken: String): Boolean {
        val domain = hostedDomain ?: return true
        return JwtDecoder.matchesHostedDomain(idToken, domain)
    }

    /**
     * Fetch the stored Google credential without showing any UI.
     *
     * `setFilterByAuthorizedAccounts(true)` restricts this to accounts that have
     * already signed in to this app, so it either restores the existing session
     * or returns null — it can never prompt the user to pick a new account.
     */
    private suspend fun silentCredential(
        activity: Activity,
        clientId: String
    ): GoogleIdTokenCredential? {
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(clientId)
            .setFilterByAuthorizedAccounts(true)
            .setAutoSelectEnabled(true)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val cred = CredentialManager.create(activity).getCredential(activity, request).credential
        if (cred !is androidx.credentials.CustomCredential ||
            cred.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            return null
        }
        return GoogleIdTokenCredential.createFrom(cred.data)
    }

    /**
     * Best-effort recovery of the signed-in account's email for authorize()'s
     * account pin, used when the in-memory copy was lost to a process restart.
     * Returns null rather than throwing — the caller turns that into a clear
     * "call signIn() first" rejection.
     */
    private suspend fun recoverAccountEmail(activity: Activity, clientId: String): String? = try {
        val google = silentCredential(activity, clientId)
        if (google != null && hostedDomainMatches(google.idToken)) google.id else null
    } catch (e: Exception) {
        Log.w(TAG, "Could not recover the signed-in account for authorize()", e)
        null
    }

    private fun resolveAuthorization(
        result: AuthorizationResult,
        expectedAccount: String?,
        promise: Promise
    ) {
        val accessToken = result.accessToken
        if (accessToken == null) {
            promise.reject(Err.UNKNOWN, "authorization returned no access token", null)
            return
        }
        // Confirm the grant landed on the account we pinned. This is best-effort:
        // toGoogleSignInAccount() may report nothing, and then the setAccount pin
        // is all we have. But when it does report a different account, hand back
        // an error rather than a token belonging to someone the caller never
        // signed in — the result carries no account, so nobody downstream could
        // catch it. Emails stay out of the message; the code is what callers branch on.
        val granted = result.toGoogleSignInAccount()?.email
        if (expectedAccount != null && granted != null && !granted.equals(expectedAccount, ignoreCase = true)) {
            promise.reject(
                Err.NO_CREDENTIAL,
                "authorization was granted to a different account than the signed-in one",
                null
            )
            return
        }
        // AuthorizationResult carries no expiry, so expiresAt is always null here —
        // callers re-authorize when an API call comes back 401.
        promise.resolve(
            mapOf(
                "accessToken" to accessToken,
                "grantedScopes" to result.grantedScopes,
                "expiresAt" to null
            )
        )
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
