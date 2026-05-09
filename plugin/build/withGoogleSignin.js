"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("@expo/config-plugins");
const withGoogleSignin = (config, props) => {
    if (!props || !props.iosUrlScheme) {
        throw new Error('expo-google-signin: iosUrlScheme is required in plugin props');
    }
    return (0, config_plugins_1.withInfoPlist)(config, (cfg) => {
        const existing = cfg.modResults.CFBundleURLTypes ?? [];
        const alreadyPresent = existing.some((t) => t.CFBundleURLSchemes?.includes(props.iosUrlScheme));
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
exports.default = withGoogleSignin;
