"use dom";
import React, { useEffect } from "react";
import { useDOMImperativeHandle } from "expo/dom";
import type { DOMProps } from "expo/dom";
import type { NativeBridge } from "./native-bridge";
import "./style.css";

type Props = {
  native: boolean;
  nativeAuth: NativeBridge["auth"];
  copy: NativeBridge["copy"];
  exit: NativeBridge["exit"];
  reportStartup(error: string | null): Promise<void>;
  ref?: React.Ref<{ back(): void }>;
  dom?: DOMProps;
};
export default function LegacyUI({ native, nativeAuth, copy, exit, reportStartup, ref }: Props) {
  useDOMImperativeHandle(ref ?? null, () => ({
    back() { void import("./main").then(app => app.nativeBack()); }
  }), []);
  useEffect(() => {
    if (native) {
      (window as Window & { secretsKeepNative?: NativeBridge }).secretsKeepNative = {
        auth: nativeAuth, copy, exit
      };
    }
    void import("./main")
      .then(app => app.applicationReady)
      .then(() => reportStartup(null))
      .catch(() => reportStartup("Không thể mở giao diện. Vui lòng thử lại."));
  }, []);
  return <main id="app" />;
}
