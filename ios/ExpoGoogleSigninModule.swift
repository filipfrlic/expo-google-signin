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

struct AuthorizeOptions: Record {
    @Field var scopes: [String] = []
}

private enum Err {
    static let signInCancelled = "ERR_SIGN_IN_CANCELLED"
    static let noCredential = "ERR_NO_CREDENTIAL"
    static let network = "ERR_NETWORK"
    static let notConfigured = "ERR_NOT_CONFIGURED"
    static let unknown = "ERR_UNKNOWN"
}

public class ExpoGoogleSigninModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoGoogleSignin")

        Function("configure") { (options: ConfigureOptions) in
            let resolvedIosClientId = options.iosClientId ?? Self.readClientIdFromPlist()
            guard let iosId = resolvedIosClientId else { return }
            let config = GIDConfiguration(
                clientID: iosId,
                serverClientID: options.webClientId,
                hostedDomain: options.hostedDomain,
                openIDRealm: nil
            )
            // GIDSignIn.sharedInstance is read on main during signIn; assign on main to avoid a JS-thread/main-thread data race.
            DispatchQueue.main.async {
                GIDSignIn.sharedInstance.configuration = config
            }
        }

        AsyncFunction("signIn") { (options: SignInOptions, promise: Promise) in
            DispatchQueue.main.async {
                guard GIDSignIn.sharedInstance.configuration != nil else {
                    return promise.reject(Err.notConfigured, "configure() not called or iosClientId unresolved")
                }
                guard let presenter = Self.topViewController() else {
                    return promise.reject(Err.unknown, "no presenting view controller")
                }
                GIDSignIn.sharedInstance.signIn(
                    withPresenting: presenter,
                    hint: nil,
                    additionalScopes: nil,
                    nonce: options.nonce
                ) { result, error in
                    if let error = error as NSError? {
                        if error.code == GIDSignInError.canceled.rawValue {
                            return promise.reject(Err.signInCancelled, "user cancelled")
                        }
                        if error.domain == NSURLErrorDomain {
                            return promise.reject(Err.network, error.localizedDescription)
                        }
                        return promise.reject(Err.unknown, error.localizedDescription)
                    }
                    guard let user = result?.user,
                          let idToken = user.idToken?.tokenString,
                          let userId = user.userID,
                          let email = user.profile?.email else {
                        return promise.reject(Err.unknown, "missing required user fields in sign-in result")
                    }
                    promise.resolve(Self.buildResult(idToken: idToken, userId: userId, email: email, user: user))
                }
            }
        }

        AsyncFunction("authorize") { (options: AuthorizeOptions, promise: Promise) in
            DispatchQueue.main.async {
                guard GIDSignIn.sharedInstance.configuration != nil else {
                    return promise.reject(Err.notConfigured, "configure() not called or iosClientId unresolved")
                }
                guard !options.scopes.isEmpty else {
                    return promise.reject(Err.unknown, "authorize() requires at least one scope")
                }
                guard let presenter = Self.topViewController() else {
                    return promise.reject(Err.unknown, "no presenting view controller")
                }

                let addScopes: (GIDGoogleUser) -> Void = { user in
                    user.addScopes(options.scopes, presenting: presenter) { result, error in
                        if let error = error as NSError? {
                            // Already-granted scopes are a success: the current
                            // user's token already covers the request.
                            if error.code == GIDSignInError.scopesAlreadyGranted.rawValue {
                                return Self.resolveAuthorization(user: user, promise: promise)
                            }
                            if error.code == GIDSignInError.canceled.rawValue {
                                return promise.reject(Err.signInCancelled, "user cancelled")
                            }
                            if error.domain == NSURLErrorDomain {
                                return promise.reject(Err.network, error.localizedDescription)
                            }
                            return promise.reject(Err.unknown, error.localizedDescription)
                        }
                        Self.resolveAuthorization(user: result?.user ?? user, promise: promise)
                    }
                }

                if let current = GIDSignIn.sharedInstance.currentUser {
                    addScopes(current)
                } else {
                    // Mirrors getCurrentUser(): try the keychain before giving up.
                    GIDSignIn.sharedInstance.restorePreviousSignIn { user, _ in
                        guard let user else {
                            return promise.reject(
                                Err.noCredential,
                                "authorize() requires a signed-in user — call signIn() first"
                            )
                        }
                        addScopes(user)
                    }
                }
            }
        }

        AsyncFunction("signOut") { (promise: Promise) in
            GIDSignIn.sharedInstance.signOut()
            promise.resolve(nil)
        }

        AsyncFunction("getCurrentUser") { (promise: Promise) in
            guard GIDSignIn.sharedInstance.configuration != nil else {
                return promise.reject(Err.notConfigured, "configure() not called or iosClientId unresolved")
            }
            GIDSignIn.sharedInstance.restorePreviousSignIn { user, error in
                if let error = error as NSError? {
                    if error.code == GIDSignInError.hasNoAuthInKeychain.rawValue {
                        return promise.resolve(nil)
                    }
                    return promise.reject(Err.unknown, error.localizedDescription)
                }
                guard let user,
                      let idToken = user.idToken?.tokenString,
                      let userId = user.userID,
                      let email = user.profile?.email else {
                    return promise.resolve(nil)
                }
                promise.resolve(Self.buildResult(idToken: idToken, userId: userId, email: email, user: user))
            }
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

    private static func resolveAuthorization(user: GIDGoogleUser, promise: Promise) {
        let token = user.accessToken
        // expirationDate is optional; JS receives null when absent.
        let expiresAt = token.expirationDate.map { $0.timeIntervalSince1970 * 1000 }
        promise.resolve([
            "accessToken": token.tokenString,
            "grantedScopes": user.grantedScopes ?? [],
            "expiresAt": expiresAt,
        ] as [String: Any?])
    }

    private static func buildResult(idToken: String, userId: String, email: String, user: GIDGoogleUser) -> [String: Any?] {
        return [
            "idToken": idToken,
            "user": [
                "id": userId,
                "email": email,
                "name": user.profile?.name,
                "givenName": user.profile?.givenName,
                "familyName": user.profile?.familyName,
                "photo": user.profile?.imageURL(withDimension: 200)?.absoluteString,
            ],
        ]
    }
}
