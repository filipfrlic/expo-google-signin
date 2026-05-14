import type { ConfigureOptions, SignInOptions, SignInResult } from './types';
import { loadGis } from './web/loadGis';
import { decodeIdToken } from './web/decodeIdToken';
import { writeCached } from './web/storage';
import { GoogleSigninError } from './errors';

type Google = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        nonce?: string;
        use_fedcm_for_prompt?: boolean;
        auto_select?: boolean;
      }) => void;
      prompt: (
        listener?: (notification: {
          isNotDisplayed: () => boolean;
          isSkippedMoment: () => boolean;
          isDismissedMoment: () => boolean;
          getNotDisplayedReason?: () => string;
          getSkippedReason?: () => string;
          getDismissedReason?: () => string;
        }) => void
      ) => void;
      disableAutoSelect: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: Google;
  }
}

let configured: ConfigureOptions | undefined;
let scriptLoad: Promise<void> | undefined;

const configure = (options: ConfigureOptions): void => {
  configured = options;
  if (!scriptLoad) {
    scriptLoad = loadGis();
  }
};

const toUser = (jwt: string) => {
  const decoded = decodeIdToken(jwt);
  return {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name ?? null,
    givenName: decoded.given_name ?? null,
    familyName: decoded.family_name ?? null,
    photo: decoded.picture ?? null,
  };
};

const signIn = async (options: SignInOptions): Promise<SignInResult> => {
  if (!configured) {
    throw new GoogleSigninError('ERR_NOT_CONFIGURED', 'configure() was not called');
  }
  await scriptLoad;
  const google = window.google;
  if (!google) {
    throw new GoogleSigninError('ERR_UNKNOWN', 'Google Identity Services failed to load');
  }
  return new Promise<SignInResult>((resolve, reject) => {
    let settled = false;
    google.accounts.id.initialize({
      client_id: configured!.webClientId,
      callback: (response) => {
        if (settled) return;
        settled = true;
        try {
          const user = toUser(response.credential);
          const result: SignInResult = { idToken: response.credential, user };
          writeCached(result);
          resolve(result);
        } catch (err) {
          reject(new GoogleSigninError('ERR_UNKNOWN', (err as Error).message));
        }
      },
      nonce: options.nonce,
      use_fedcm_for_prompt: true,
      auto_select: false,
    });
    google.accounts.id.prompt((_notification) => {
      // Moment handling added in later tasks.
    });
  });
};

const signOut = async (): Promise<void> => {
  throw new Error('not implemented');
};

const getCurrentUser = async (): Promise<SignInResult | null> => {
  throw new Error('not implemented');
};

export default { configure, signIn, signOut, getCurrentUser };
