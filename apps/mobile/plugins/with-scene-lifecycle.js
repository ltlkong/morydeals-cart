// iOS 27 terminates apps that still use the window-based app lifecycle, and the
// Expo SDK 57 template has not adopted UIScene yet. Expo already ships a scene
// delegate; this hands app startup to it on every prebuild.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const provider = "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {";
const windowStartup =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    let source = mod.modResults.contents;
    if (source.includes(provider)) return mod;
    const migrated = source
      .replace("class AppDelegate: ExpoAppDelegate {", provider)
      .replace(windowStartup, "\n");
    // Fail loudly if a newer template changes shape instead of shipping a half-migrated app.
    if (!migrated.includes(provider) || /window = UIWindow\(/.test(migrated))
      throw new Error("with-scene-lifecycle: unexpected AppDelegate template");
    mod.modResults.contents = migrated;
    return mod;
  });
};
