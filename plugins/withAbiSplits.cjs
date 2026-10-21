const { withAppBuildGradle } = require("@expo/config-plugins");

const marker = "// secrets-keep: ABI APK splits";
const block = `
${marker}
android {
    splits {
        abi {
            enable true
            reset()
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
            universalApk false
        }
    }
}
`;

module.exports = (config) =>
  withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("ABI splits require Groovy app build.gradle");
    }
    if (!modConfig.modResults.contents.includes(marker)) {
      modConfig.modResults.contents += block;
    }
    return modConfig;
  });

module.exports.marker = marker;
module.exports.block = block;
