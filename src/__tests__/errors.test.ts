import { GoogleSigninError, mapNativeError } from '../errors';

describe('GoogleSigninError', () => {
  it('exposes code and message', () => {
    const err = new GoogleSigninError('ERR_SIGN_IN_CANCELLED', 'user cancelled');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GoogleSigninError);
    expect(err.code).toBe('ERR_SIGN_IN_CANCELLED');
    expect(err.message).toBe('user cancelled');
    expect(err.name).toBe('GoogleSigninError');
  });
});

describe('mapNativeError', () => {
  it('preserves a known unified code', () => {
    const native = { code: 'ERR_SIGN_IN_CANCELLED', message: 'cancelled' };
    const out = mapNativeError(native);
    expect(out.code).toBe('ERR_SIGN_IN_CANCELLED');
  });

  it('maps unknown codes to ERR_UNKNOWN', () => {
    const native = { code: 'WEIRD_CODE', message: 'no idea' };
    const out = mapNativeError(native);
    expect(out.code).toBe('ERR_UNKNOWN');
    expect(out.message).toBe('no idea');
  });

  it('handles non-Error inputs safely', () => {
    const out = mapNativeError('string error');
    expect(out.code).toBe('ERR_UNKNOWN');
    expect(out.message).toBe('string error');
  });
});
