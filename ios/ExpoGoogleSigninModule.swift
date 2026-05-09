import ExpoModulesCore
import GoogleSignIn

struct ConfigureOptions: Record {
    @Field var webClientId: String = ""
    @Field var iosClientId: String?
    @Field var hostedDomain: String?
}

struct SignInOptions: Record {
    @Field var nonce: String?
}

public class ExpoGoogleSigninModule: Module {
    private var webClientId: String?
    private var iosClientId: String?
    private var hostedDomain: String?

    public func definition() -> ModuleDefinition {
        Name("ExpoGoogleSignin")

        Function("configure") { (_: ConfigureOptions) in }

        AsyncFunction("signIn") { (_: SignInOptions, promise: Promise) in
            promise.reject("ERR_UNKNOWN", "not implemented yet")
        }

        AsyncFunction("signOut") { (promise: Promise) in
            promise.reject("ERR_UNKNOWN", "not implemented yet")
        }

        AsyncFunction("getCurrentUser") { (promise: Promise) in
            promise.reject("ERR_UNKNOWN", "not implemented yet")
        }
    }
}
