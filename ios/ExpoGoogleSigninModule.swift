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

        Function("configure") { (options: ConfigureOptions) in
            let resolvedIosClientId = options.iosClientId ?? Self.readClientIdFromPlist()
            self.webClientId = options.webClientId
            self.iosClientId = resolvedIosClientId
            self.hostedDomain = options.hostedDomain

            if let iosId = resolvedIosClientId {
                GIDSignIn.sharedInstance.configuration = GIDConfiguration(
                    clientID: iosId,
                    serverClientID: options.webClientId,
                    hostedDomain: options.hostedDomain
                )
            }
        }

        AsyncFunction("signIn") { (_: SignInOptions, promise: Promise) in
            promise.reject("ERR_UNKNOWN", "not implemented yet")
        }

        AsyncFunction("signOut") { (promise: Promise) in
            GIDSignIn.sharedInstance.signOut()
            promise.resolve(nil)
        }

        AsyncFunction("getCurrentUser") { (promise: Promise) in
            promise.reject("ERR_UNKNOWN", "not implemented yet")
        }
    }

    private static func readClientIdFromPlist() -> String? {
        guard let url = Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"),
              let data = try? Data(contentsOf: url),
              let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] else {
            return nil
        }
        return plist["CLIENT_ID"] as? String
    }
}
