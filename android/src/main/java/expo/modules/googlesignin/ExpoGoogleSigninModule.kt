package expo.modules.googlesignin

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.CodedException

class NotImplementedException : CodedException("ERR_UNKNOWN", "not implemented yet", null)

class ExpoGoogleSigninModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExpoGoogleSignin")

        Function("configure") { _: ConfigureOptions -> }

        AsyncFunction("signIn") { _: SignInOptions ->
            throw NotImplementedException()
        }

        AsyncFunction("signOut") {
            throw NotImplementedException()
        }

        AsyncFunction("getCurrentUser") {
            throw NotImplementedException()
        }
    }
}
