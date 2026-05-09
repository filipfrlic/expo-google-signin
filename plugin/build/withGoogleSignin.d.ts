import { ConfigPlugin } from '@expo/config-plugins';
type Props = {
    /** Reversed iOS OAuth client ID, e.g. com.googleusercontent.apps.<NUMBER>-<HASH> */
    iosUrlScheme: string;
};
declare const withGoogleSignin: ConfigPlugin<Props>;
export default withGoogleSignin;
