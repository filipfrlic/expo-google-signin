package expo.modules.googlesignin

import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ExpoGoogleSigninModule : Module() {
    private var webClientId: String? = null
    private var hostedDomain: String? = null

    override fun definition() = ModuleDefinition {
        Name("ExpoGoogleSignin")

        Function("configure") { options: ConfigureOptions ->
            webClientId = options.webClientId
            hostedDomain = options.hostedDomain
        }

        AsyncFunction("signIn") { _: SignInOptions ->
            requireWebClientId()
            throw NotImplementedException()
        }

        AsyncFunction("signOut") { promise: Promise ->
            val ctx = appContext.reactContext
                ?: return@AsyncFunction promise.reject("ERR_UNKNOWN", "no react context", null)
            val cm = CredentialManager.create(ctx)
            CoroutineScope(Dispatchers.Main).launch {
                try {
                    cm.clearCredentialState(ClearCredentialStateRequest())
                    promise.resolve(null)
                } catch (e: Exception) {
                    promise.reject("ERR_UNKNOWN", e.message ?: "signOut failed", e)
                }
            }
        }

        AsyncFunction("getCurrentUser") {
            requireWebClientId()
            throw NotImplementedException()
        }
    }

    private fun requireWebClientId(): String =
        webClientId?.takeIf { it.isNotBlank() } ?: throw NotConfiguredException()
}
