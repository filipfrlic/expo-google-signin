import { ConfigPlugin, withInfoPlist } from '@expo/config-plugins';

type Props = {
  /** Reversed iOS OAuth client ID, e.g. com.googleusercontent.apps.<NUMBER>-<HASH> */
  iosUrlScheme: string;
};

const withGoogleSignin: ConfigPlugin<Props> = (config, props) => {
  if (!props || !props.iosUrlScheme) {
    throw new Error('expo-google-signin: iosUrlScheme is required in plugin props');
  }
  return withInfoPlist(config, (cfg) => {
    const existing = cfg.modResults.CFBundleURLTypes ?? [];
    const alreadyPresent = existing.some((t) =>
      t.CFBundleURLSchemes?.includes(props.iosUrlScheme)
    );
    if (alreadyPresent) {
      return cfg;
    }
    cfg.modResults = {
      ...cfg.modResults,
      CFBundleURLTypes: [...existing, { CFBundleURLSchemes: [props.iosUrlScheme] }],
    };
    return cfg;
  });
};

export default withGoogleSignin;
