export type DecodedIdToken = {
  sub: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  hd?: string;
  exp: number;
};

const base64urlDecode = (input: string): string => {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    return decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }
  return Buffer.from(b64, 'base64').toString('utf-8');
};

export const decodeIdToken = (jwt: string): DecodedIdToken => {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 segments');
  }
  const json = base64urlDecode(parts[1]);
  const payload = JSON.parse(json) as DecodedIdToken;
  return payload;
};
