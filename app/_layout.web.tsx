import React, { useEffect, useState } from "react";
import App from "../src/App";
import { login, getAccessToken } from "../src/auth.web";

export default function WebLayout() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Keep the existing Firebase bridge on its original domains. Other web
    // hosts use a popup from the same original sign-in button.
    const usePopup = !["https://awesome-89e82.web.app", "https://awesome-89e82.firebaseapp.com"].includes(location.origin);
    if (usePopup) sessionStorage.setItem("secrets-keep.oauth-auto-reconnect", "1");
    const connect = async (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>("#login");
      if (!usePopup || !button || button.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      try {
        if (!await login()) return;
        const token = await getAccessToken();
        localStorage.setItem("secret-keep.google-session", JSON.stringify({
          accessToken: token, expiresAt: Date.now() + 3_500_000, signedIn: true
        }));
        location.reload();
      } catch {
        button.disabled = false;
      }
    };
    window.addEventListener("click", connect, true);
    setMounted(true);
    return () => window.removeEventListener("click", connect, true);
  }, []);
  return mounted ? <App /> : null;
}
