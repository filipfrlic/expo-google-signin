package expo.modules.googlesignin

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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

        AsyncFunction("signOut") {
            throw NotImplementedException()
        }

        AsyncFunction("getCurrentUser") {
            requireWebClientId()
            throw NotImplementedException()
        }
    }

    private fun requireWebClientId(): String =
        webClientId?.takeIf { it.isNotBlank() } ?: throw NotConfiguredException()
}
