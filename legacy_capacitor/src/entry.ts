import { App as CapacitorApp } from "@capacitor/app";
import { Clipboard } from "@capacitor/clipboard";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { DriveTokenPlugin } from "./capacitor-auth";
import type { NativeBridge } from "./native-bridge";

declare global {
  interface Window {
    jsonNotebookNative?: NativeBridge;
  }
}

const native = Capacitor.isNativePlatform();

if (native) {
  const [{ SocialLogin }, { createNativeAuth }] = await Promise.all([
    import("@capgo/capacitor-social-login"),
    import("./capacitor-auth"),
  ]);

  window.jsonNotebookNative = {
    auth: createNativeAuth(SocialLogin, Capacitor.getPlatform() === "android"
      ? registerPlugin<DriveTokenPlugin>("DriveToken") : undefined),
    copy: async text => {
      await Clipboard.write({ string: text });
    },
    exit: async () => {
      await CapacitorApp.exitApp();
    },
  };
}

const app = await import("./main");

if (native) {
  await CapacitorApp.addListener("backButton", () => {
    app.nativeBack();
  });
}
