import { decodeIdToken } from '../web/decodeIdToken';

const b64url = (s: string) =>
  Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const makeJwt = (payload: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.signature`;

describe('decodeIdToken', () => {
  it('decodes a well-formed JWT payload', () => {
    const token = makeJwt({
      sub: '1234567890',
      email: 'jane@example.com',
      name: 'Jane Doe',
      given_name: 'Jane',
      family_name: 'Doe',
      picture: 'https://lh3.googleusercontent.com/a/photo',
      hd: 'example.com',
      exp: 1893456000,
    });
    expect(decodeIdToken(token)).toEqual({
      sub: '1234567890',
      email: 'jane@example.com',
      name: 'Jane Doe',
      given_name: 'Jane',
      family_name: 'Doe',
      picture: 'https://lh3.googleusercontent.com/a/photo',
      hd: 'example.com',
      exp: 1893456000,
    });
  });

  it('returns undefined for missing optional claims', () => {
    const token = makeJwt({ sub: 'abc', email: 'a@b.com', exp: 1893456000 });
    const decoded = decodeIdToken(token);
    expect(decoded.sub).toBe('abc');
    expect(decoded.email).toBe('a@b.com');
    expect(decoded.name).toBeUndefined();
    expect(decoded.given_name).toBeUndefined();
    expect(decoded.family_name).toBeUndefined();
    expect(decoded.picture).toBeUndefined();
    expect(decoded.hd).toBeUndefined();
  });

  it('throws on malformed JWT (wrong segment count)', () => {
    expect(() => decodeIdToken('not.a.jwt.token')).toThrow();
    expect(() => decodeIdToken('only-one-segment')).toThrow();
  });

  it('throws on malformed base64', () => {
    expect(() => decodeIdToken('header.!!!notbase64!!!.sig')).toThrow();
  });

  it('handles base64url padding correctly', () => {
    const token = makeJwt({ sub: 'x', email: 'y@z.com', exp: 1 });
    expect(decodeIdToken(token).sub).toBe('x');
  });
});
