import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  APP_ORIGIN,
  AUTH_BRIDGE_PARAM,
  AUTH_HANDOFF_ERROR,
  AUTH_HANDOFF_EXPIRES,
  AUTH_HANDOFF_RETURN,
  AUTH_HANDOFF_TOKEN,
  AUTH_ORIGIN,
  DRIVE_SCOPE,
  firebaseConfig,
  OAUTH_AUTO_RECONNECT_KEY,
  OAUTH_BRIDGE_ATTEMPT_KEY,
  OAUTH_RETURN_KEY,
  SESSION_KEY,
} from "@/lib/config";
import { LoginRequired } from "@/lib/session";

export type StoredWebSession = {
  accessToken: string;
  expiresAt: number;
  signedIn: boolean;
};

const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope(DRIVE_SCOPE);
googleProvider.setCustomParameters({
  include_granted_scopes: "true",
});

function isFirebaseBridgeOrigin() {
  if (typeof window === "undefined") return false;
  return window.location.origin === APP_ORIGIN || window.location.origin === AUTH_ORIGIN;
}

export function storedSession(): StoredWebSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(SESSION_KEY) ||
      window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredWebSession;
    if (
      !value ||
      typeof value.expiresAt !== "number" ||
      typeof value.signedIn !== "boolean"
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function saveSession(token: string, expiresInSeconds: number) {
  if (typeof window === "undefined") return;
  const payload: StoredWebSession = {
    accessToken: token,
    expiresAt: Date.now() + Math.max(0, expiresInSeconds - 60) * 1000,
    signedIn: true,
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function clearOAuthAttempt() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(OAUTH_RETURN_KEY);
  window.sessionStorage.removeItem(OAUTH_AUTO_RECONNECT_KEY);
  window.sessionStorage.removeItem(OAUTH_BRIDGE_ATTEMPT_KEY);
}

function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
  clearOAuthAttempt();
}

export async function expireCachedToken(): Promise<void> {
  if (typeof window === "undefined") return;
  const current = storedSession();
  if (!current?.signedIn) return;
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      ...current,
      accessToken: "",
      expiresAt: 0,
    } satisfies StoredWebSession),
  );
}

function storedTokenIsValid(minValidityMs = 0) {
  const session = storedSession();
  return Boolean(
    session?.signedIn &&
      session.accessToken &&
      session.expiresAt > Date.now() + minValidityMs,
  );
}

function authBridgeReturnUrl() {
  const queryReturn = new URLSearchParams(window.location.search).get(AUTH_HANDOFF_RETURN);
  const storedReturn = window.sessionStorage.getItem(OAUTH_RETURN_KEY);
  const candidate = queryReturn || storedReturn;
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.origin === APP_ORIGIN ? url.href : null;
  } catch {
    return null;
  }
}

function isAuthBridgePage() {
  return window.location.origin === AUTH_ORIGIN && Boolean(authBridgeReturnUrl());
}

function restoreAppUrl(returnUrl: string | null) {
  if (!returnUrl) return;
  try {
    const restored = new URL(returnUrl);
    if (restored.origin !== APP_ORIGIN) return;
    window.history.replaceState(
      {},
      "",
      restored.pathname + restored.search + restored.hash,
    );
  } catch {
    // Ignore malformed return URLs.
  }
}

export function consumeAuthHandoff(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.origin !== APP_ORIGIN || !window.location.hash) return false;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get(AUTH_HANDOFF_TOKEN);
  const authError = params.get(AUTH_HANDOFF_ERROR);
  if (!token && !authError) return false;

  const returnUrl = params.get(AUTH_HANDOFF_RETURN);
  if (authError) {
    window.sessionStorage.setItem(OAUTH_AUTO_RECONNECT_KEY, "1");
    restoreAppUrl(returnUrl);
    return true;
  }

  const expiresIn = Number(params.get(AUTH_HANDOFF_EXPIRES) || 3600);
  saveSession(token!, Number.isFinite(expiresIn) ? expiresIn : 3600);
  clearOAuthAttempt();
  restoreAppUrl(returnUrl);
  return true;
}

function returnFromAuthBridge(access: string | null, error = false) {
  const returnUrl = authBridgeReturnUrl() || APP_ORIGIN + "/";
  const target = new URL(returnUrl);
  const params = new URLSearchParams();

  if (access) {
    params.set(AUTH_HANDOFF_TOKEN, access);
    params.set(AUTH_HANDOFF_EXPIRES, "3600");
  }
  if (error) params.set(AUTH_HANDOFF_ERROR, "1");
  params.set(AUTH_HANDOFF_RETURN, returnUrl);

  target.hash = params.toString();
  clearOAuthAttempt();
  window.location.replace(target.href);
}

async function beginOfflineOAuth(automatic = false): Promise<never> {
  if (window.location.origin === APP_ORIGIN) {
    if (automatic) {
      window.sessionStorage.setItem(OAUTH_AUTO_RECONNECT_KEY, "1");
    } else {
      window.sessionStorage.removeItem(OAUTH_AUTO_RECONNECT_KEY);
    }

    const bridge = new URL(AUTH_ORIGIN + "/");
    bridge.searchParams.set(AUTH_BRIDGE_PARAM, automatic ? "auto" : "manual");
    bridge.searchParams.set(AUTH_HANDOFF_RETURN, window.location.href);
    window.location.assign(bridge.href);
    throw new LoginRequired("Redirecting to Firebase OAuth bridge");
  }

  const bridgeReturn = authBridgeReturnUrl();
  window.sessionStorage.setItem(OAUTH_RETURN_KEY, bridgeReturn || window.location.href);

  if (automatic) {
    window.sessionStorage.setItem(OAUTH_AUTO_RECONNECT_KEY, "1");
  } else {
    window.sessionStorage.removeItem(OAUTH_AUTO_RECONNECT_KEY);
  }

  window.sessionStorage.setItem(OAUTH_BRIDGE_ATTEMPT_KEY, "1");
  await signInWithRedirect(auth, googleProvider);
  throw new LoginRequired("Redirecting to Google OAuth");
}

async function handleOfflineOAuthCallback(): Promise<boolean> {
  const result = await getRedirectResult(auth);
  if (!result) return false;

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const access = credential?.accessToken || "";
  if (!access) {
    throw new Error("Google did not return an OAuth access token");
  }

  if (isAuthBridgePage()) {
    returnFromAuthBridge(access);
    return true;
  }

  saveSession(access, 3600);
  clearOAuthAttempt();
  return true;
}

export function hasPreviousSignIn(): boolean {
  return Boolean(storedSession()?.signedIn || auth.currentUser);
}

function automaticReconnectBlocked() {
  if (typeof window === "undefined") return true;
  return window.sessionStorage.getItem(OAUTH_AUTO_RECONNECT_KEY) === "1";
}

export async function restoreSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (window.location.origin === AUTH_ORIGIN) {
    if (!isAuthBridgePage()) {
      window.location.replace(
        APP_ORIGIN +
          window.location.pathname +
          window.location.search +
          window.location.hash,
      );
      return false;
    }

    await setPersistence(auth, browserLocalPersistence);
    const attempted = window.sessionStorage.getItem(OAUTH_BRIDGE_ATTEMPT_KEY) === "1";
    try {
      if (await handleOfflineOAuthCallback()) return false;
    } catch (error) {
      console.error("Google OAuth callback failed", error);
      returnFromAuthBridge(null, true);
      return false;
    }

    if (attempted) {
      returnFromAuthBridge(null, true);
      return false;
    }

    const automatic =
      new URLSearchParams(window.location.search).get(AUTH_BRIDGE_PARAM) === "auto";
    await beginOfflineOAuth(automatic);
    return false;
  }

  consumeAuthHandoff();

  await setPersistence(auth, browserLocalPersistence);
  await auth.authStateReady();

  try {
    if (await handleOfflineOAuthCallback()) {
      return true;
    }
  } catch (error) {
    console.error("OAuth redirect check failed", error);
  }

  if (!storedTokenIsValid(30_000)) {
    if (isFirebaseBridgeOrigin() && hasPreviousSignIn() && !automaticReconnectBlocked()) {
      await beginOfflineOAuth(true);
    }
    return false;
  }

  return true;
}

export async function login(): Promise<boolean> {
  if (isFirebaseBridgeOrigin()) {
    await beginOfflineOAuth(false);
    return false;
  }

  await setPersistence(auth, browserLocalPersistence);
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) {
      throw new Error("Google did not grant Drive access.");
    }
    saveSession(token, 3600);
    clearOAuthAttempt();
    return true;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "auth/popup-blocked") {
      await signInWithRedirect(auth, googleProvider);
      return false;
    }
    throw error;
  }
}

export async function getAccessToken(force = false): Promise<string> {
  if (!force && storedTokenIsValid(30_000)) {
    return storedSession()!.accessToken;
  }

  if (force) {
    await expireCachedToken();
  }

  if (isFirebaseBridgeOrigin() && hasPreviousSignIn() && !automaticReconnectBlocked()) {
    await beginOfflineOAuth(true);
  }

  throw new LoginRequired("Google authorization required");
}

export async function logout(): Promise<void> {
  clearSession();
  await firebaseSignOut(auth);
}

export { LoginRequired };
