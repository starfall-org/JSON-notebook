import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { DRIVE_SCOPE, googleWebClientId } from "@/lib/config";
import { createTokenManager, LoginRequired } from "@/lib/session";

const TOKEN_CACHE_MS = 50 * 60_000;

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: googleWebClientId || undefined,
    scopes: [DRIVE_SCOPE],
    offlineAccess: false,
  });
  configured = true;
}

ensureConfigured();

function isCredentialRevokedError(error: unknown) {
  if (isErrorWithCode(error)) {
    const code = error.code;
    if (
      code === statusCodes.SIGN_IN_REQUIRED ||
      code === statusCodes.SIGN_IN_CANCELLED ||
      code === "NO_SAVED_CREDENTIAL_FOUND"
    ) {
      return true;
    }
  }
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    text.includes("requires a user to be signed in") ||
    text.includes("failed authentication recovery") ||
    text.includes("no credential") ||
    text.includes("authorization required")
  );
}

const manager = createTokenManager(
  {
    async read() {
      return null;
    },
    async write() {
      // Keep Drive access tokens in memory; Google Play Services retains account state.
    },
  },
  async (session, force) => {
    ensureConfigured();
    try {
      if (!GoogleSignin.getCurrentUser()) {
        const restored = await GoogleSignin.signInSilently();
        if (restored.type !== "success") {
          throw new LoginRequired("Quyền Google đã bị thu hồi. Vui lòng kết nối lại.");
        }
      }
      if (force && session.accessToken) {
        await GoogleSignin.clearCachedAccessToken(session.accessToken);
      }
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.accessToken) {
        throw new LoginRequired("Google Drive authorization required");
      }
      return {
        accessToken: tokens.accessToken,
        expiresAt: Date.now() + TOKEN_CACHE_MS,
      };
    } catch (error) {
      if (error instanceof LoginRequired) throw error;
      if (isCredentialRevokedError(error)) {
        throw new LoginRequired("Vui lòng kết nối lại Google.");
      }
      throw error;
    }
  },
);

export function hasPreviousSignIn(): boolean {
  try {
    ensureConfigured();
    return GoogleSignin.hasPreviousSignIn();
  } catch {
    return false;
  }
}

export async function restoreSession(): Promise<boolean> {
  ensureConfigured();
  if (!GoogleSignin.hasPreviousSignIn()) return false;
  // Restore account without interactive UI; defer token fetch until first Drive request.
  await manager.set({ accessToken: "", expiresAt: 0 });
  return true;
}

export async function login(): Promise<boolean> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result)) return false;
  const tokens = await GoogleSignin.getTokens();
  await manager.set({
    accessToken: tokens.accessToken,
    expiresAt: Date.now() + TOKEN_CACHE_MS,
  });
  return true;
}

export const getAccessToken = (force = false): Promise<string> => manager.token(force);

export async function expireCachedToken(): Promise<void> {
  // Handled directly via getAccessToken(true) calling clearCachedAccessToken.
}

export async function logout(): Promise<void> {
  ensureConfigured();
  await manager.set(null);
  await GoogleSignin.signOut();
}

export { LoginRequired };
