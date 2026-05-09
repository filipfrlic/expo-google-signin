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
    const types: { CFBundleURLSchemes: string[] }[] = cfg.modResults.CFBundleURLTypes ?? [];
    const exists = types.some((t) =>
      t.CFBundleURLSchemes?.includes(props.iosUrlScheme)
    );
    if (!exists) {
      types.push({ CFBundleURLSchemes: [props.iosUrlScheme] });
    }
    cfg.modResults.CFBundleURLTypes = types;
    return cfg;
  });
};

export default withGoogleSignin;
