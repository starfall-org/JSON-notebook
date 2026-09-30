const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");
const marker = "// secrets-keep: local DOM storage and Drive requests";
module.exports = config => withDangerousMod(config, ["android", async config => {
  const packagePath = require.resolve("@expo/dom-webview/package.json", { paths: [config.modRequest.projectRoot] });
  const sourcePath = path.join(path.dirname(packagePath), "android/src/main/java/expo/modules/webview/DomWebView.kt");
  let source = fs.readFileSync(sourcePath, "utf8");
  if (!source.includes(marker)) {
    const settings = "settings.javaScriptEnabled = true";
    if (!source.includes(settings)) throw new Error("Expo DOM WebView settings changed; review the Android storage patch.");
    source = source.replace(settings, settings + `
      ${marker}
      settings.domStorageEnabled = true
      settings.allowUniversalAccessFromFileURLs = true`);
    const client = "private fun createWebViewClient() = object : WebViewClient() {";
    if (!source.includes(client)) throw new Error("Expo DOM WebView client changed; review external navigation.");
    source = source.replace(client, client + `
    override fun shouldOverrideUrlLoading(view: WebView?, request: android.webkit.WebResourceRequest?): Boolean {
      val target = request?.url ?: return true
      if (target.scheme == "file" && target.path?.startsWith("/android_asset/www.bundle/") == true) return false
      if (target.scheme == "https" || target.scheme == "http") {
        try {
          context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, target).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: android.content.ActivityNotFoundException) {
          // Keep external pages outside the credential-bearing WebView.
        }
      }
      return true
    }
`);
    fs.writeFileSync(sourcePath, source);
  }
  return config;
}]);
