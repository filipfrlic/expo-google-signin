import type { ConfigureOptions, SignInOptions, SignInResult } from './types';
import { loadGis } from './web/loadGis';

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

const signIn = async (_options: SignInOptions): Promise<SignInResult> => {
  throw new Error('not implemented');
};

const signOut = async (): Promise<void> => {
  throw new Error('not implemented');
};

const getCurrentUser = async (): Promise<SignInResult | null> => {
  throw new Error('not implemented');
};

export default { configure, signIn, signOut, getCurrentUser };
