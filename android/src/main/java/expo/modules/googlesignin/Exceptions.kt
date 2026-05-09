package expo.modules.googlesignin

import expo.modules.kotlin.exception.CodedException

class NotImplementedException : CodedException("ERR_UNKNOWN", "not implemented yet", null)
class NotConfiguredException : CodedException("ERR_NOT_CONFIGURED", "configure() must be called before signIn() / getCurrentUser()", null)
