"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("@expo/config-plugins");
const withGoogleSignin = (config, props) => {
    if (!props || !props.iosUrlScheme) {
        throw new Error('expo-google-signin: iosUrlScheme is required in plugin props');
    }
    return (0, config_plugins_1.withInfoPlist)(config, (cfg) => {
        const types = cfg.modResults.CFBundleURLTypes ?? [];
        const exists = types.some((t) => t.CFBundleURLSchemes?.includes(props.iosUrlScheme));
        if (!exists) {
            types.push({ CFBundleURLSchemes: [props.iosUrlScheme] });
        }
        cfg.modResults.CFBundleURLTypes = types;
        return cfg;
    });
};
exports.default = withGoogleSignin;
