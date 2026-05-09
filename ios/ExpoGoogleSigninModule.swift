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

        AsyncFunction("signIn") { (options: SignInOptions, promise: Promise) in
            guard self.webClientId != nil, GIDSignIn.sharedInstance.configuration != nil else {
                return promise.reject("ERR_NOT_CONFIGURED", "configure() not called or iosClientId unresolved")
            }
            DispatchQueue.main.async {
                guard let presenter = Self.topViewController() else {
                    return promise.reject("ERR_UNKNOWN", "no presenting view controller")
                }
                GIDSignIn.sharedInstance.signIn(
                    withPresenting: presenter,
                    hint: nil,
                    additionalScopes: nil,
                    nonce: options.nonce
                ) { result, error in
                    if let error = error as NSError? {
                        if error.code == GIDSignInError.canceled.rawValue {
                            return promise.reject("ERR_SIGN_IN_CANCELLED", "user cancelled")
                        }
                        if error.domain == NSURLErrorDomain {
                            return promise.reject("ERR_NETWORK", error.localizedDescription)
                        }
                        return promise.reject("ERR_UNKNOWN", error.localizedDescription)
                    }
                    guard let user = result?.user, let idToken = user.idToken?.tokenString else {
                        return promise.reject("ERR_UNKNOWN", "missing idToken in successful sign-in")
                    }
                    promise.resolve(Self.buildResult(idToken: idToken, user: user))
                }
            }
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

    private static func topViewController() -> UIViewController? {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first(where: { $0.isKeyWindow }),
              var top = window.rootViewController else { return nil }
        while let presented = top.presentedViewController { top = presented }
        return top
    }

    private static func buildResult(idToken: String, user: GIDGoogleUser) -> [String: Any?] {
        return [
            "idToken": idToken,
            "user": [
                "id": user.userID ?? "",
                "email": user.profile?.email ?? "",
                "name": user.profile?.name,
                "givenName": user.profile?.givenName,
                "familyName": user.profile?.familyName,
                "photo": user.profile?.imageURL(withDimension: 200)?.absoluteString,
            ],
        ]
    }
}
