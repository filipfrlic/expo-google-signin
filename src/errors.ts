import type { ErrorCode } from './types';

const KNOWN_CODES = [
  'ERR_SIGN_IN_CANCELLED',
  'ERR_NO_CREDENTIAL',
  'ERR_PLAY_SERVICES_UNAVAILABLE',
  'ERR_NETWORK',
  'ERR_NOT_CONFIGURED',
  'ERR_UNKNOWN',
] as const satisfies ReadonlyArray<ErrorCode>;

// Compile-time exhaustiveness pin: errors if a future ErrorCode union
// member is added without a matching entry in KNOWN_CODES. The assignment
// below is what makes this fire — an unused type alias that resolves to
// `never` raises no diagnostic on its own.
type _ExhaustiveErrorCodes =
  Exclude<ErrorCode, (typeof KNOWN_CODES)[number]> extends never ? true : never;
const _exhaustiveErrorCodes: _ExhaustiveErrorCodes = true;
void _exhaustiveErrorCodes;

export class GoogleSigninError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'GoogleSigninError';
    this.code = code;
  }
}

export const mapNativeError = (native: unknown): GoogleSigninError => {
  if (typeof native === 'string') {
    return new GoogleSigninError('ERR_UNKNOWN', native);
  }
  if (typeof native === 'object' && native !== null) {
    const obj = native as { code?: string; message?: string };
    const code = (KNOWN_CODES as ReadonlyArray<string>).includes(obj.code ?? '')
      ? (obj.code as ErrorCode)
      : 'ERR_UNKNOWN';
    return new GoogleSigninError(code, obj.message ?? '');
  }
  return new GoogleSigninError('ERR_UNKNOWN', String(native));
};
