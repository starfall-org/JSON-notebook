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
module.exports = config => withAppBuildGradle(config, config => {
  if (config.modResults.language !== "groovy") throw new Error("ABI splits require Groovy app build.gradle");
  if (!config.modResults.contents.includes(marker)) config.modResults.contents += block;
  return config;
});
module.exports.marker = marker;
module.exports.block = block;
