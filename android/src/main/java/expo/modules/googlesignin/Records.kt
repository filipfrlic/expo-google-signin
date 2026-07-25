package expo.modules.googlesignin

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ConfigureOptions : Record {
    @Field var webClientId: String = ""
    @Field var hostedDomain: String? = null
}

class SignInOptions : Record {
    @Field var nonce: String? = null
}

class AuthorizeOptions : Record {
    @Field var scopes: List<String> = emptyList()
}
