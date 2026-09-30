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
  ref?: React.Ref<{ back(): void }>;
  dom?: DOMProps;
};
export default function LegacyUI({ native, nativeAuth, copy, exit, ref }: Props) {
  useDOMImperativeHandle(ref ?? null, () => ({
    back() { void import("./main").then(app => app.nativeBack()); }
  }), []);
  useEffect(() => {
    if (native) {
      (window as Window & { secretsKeepNative?: NativeBridge }).secretsKeepNative = {
        auth: nativeAuth, copy, exit
      };
    }
    void import("./main");
  }, []);
  return <main id="app" />;
}
