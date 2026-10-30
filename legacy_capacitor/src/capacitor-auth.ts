import type {
  LoginResult,
  SocialLoginPlugin,
} from "@capgo/capacitor-social-login";
import type {
  AuthOperation,
  AuthResult,
  NativeBridge,
} from "./native-bridge";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_WEB_CLIENT_ID =
  "1064411966305-6vuqla6hbp2aegichjdb3d748jqji4be.apps.googleusercontent.com";
const TOKEN_CACHE_MS = 50 * 60 * 1000;

type NativeAuth = NativeBridge["auth"];
type GoogleSocialLogin = Pick<
  SocialLoginPlugin,
  | "initialize"
  | "login"
  | "logout"
  | "refresh"
  | "getAuthorizationCode"
>;

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code || "");
}

function loginRequired(error: unknown) {
  const code = errorCode(error);
  const text = message(error).toLowerCase();
  return (
    code === "NO_CREDENTIAL_AVAILABLE" ||
    code === "LOGIN_REQUIRED" ||
    text.includes("user not logged in") ||
    text.includes("no credential") ||
    text.includes("authorization required")
  );
}

function tokenFromLogin(result: LoginResult) {
  if (
    result.provider !== "google" ||
    result.result.responseType !== "online"
  ) {
    return undefined;
  }
  return result.result.accessToken?.token || undefined;
}

export interface DriveTokenPlugin {
  token(options: { force: boolean }): Promise<{ accessToken: string }>;
  rememberAccount(options: { email?: string; idToken?: string; accessToken: string }): Promise<void>;
  clearAccount(): Promise<void>;
}

export function createNativeAuth(plugin: GoogleSocialLogin, drive?: DriveTokenPlugin): NativeAuth {
  let initializePromise: Promise<void> | undefined;
  let cachedToken = "";
  let cachedUntil = 0;
  let refreshPromise: Promise<string> | undefined;

  const initialize = () => {
    initializePromise ??= plugin.initialize({
      google: {
        webClientId: GOOGLE_WEB_CLIENT_ID,
        mode: "online",
      },
    });
    return initializePromise;
  };

  const remember = (token: string) => {
    cachedToken = token;
    cachedUntil = Date.now() + TOKEN_CACHE_MS;
    return token;
  };

  const clearLocal = () => {
    cachedToken = "";
    cachedUntil = 0;
  };

  const refreshToken = async (force = false) => {
    await initialize();

    if (!force && cachedToken && Date.now() < cachedUntil) {
      return cachedToken;
    }

    // Share one renewal across concurrent Drive requests.
    if (!refreshPromise) {
      refreshPromise = (async () => {
        let token: string | undefined;
        if (drive) {
          token = (await drive.token({ force })).accessToken;
        } else {
          await plugin.refresh({ provider: "google", options: { scopes: [DRIVE_SCOPE] } });
          token = (await plugin.getAuthorizationCode({ provider: "google" })).accessToken;
        }
        if (!token) {
          clearLocal();
          throw Object.assign(new Error("Google Drive authorization required"), { code: "LOGIN_REQUIRED" });
        }
        return remember(token);
      })().finally(() => { refreshPromise = undefined; });
    }
    return refreshPromise;
  };

  return async (
    operation: AuthOperation,
    force = false,
  ): Promise<AuthResult> => {
    try {
      if (operation === "restore") {
        try {
          const token = await refreshToken(true);
          return { signedIn: true, token };
        } catch (error) {
          if (loginRequired(error)) {
            clearLocal();
            return { signedIn: false };
          }
          return {
            signedIn: false,
            error: message(error),
          };
        }
      }

      if (operation === "logout") {
        await initialize();
        await drive?.clearAccount();
        await plugin.logout({ provider: "google" });
        clearLocal();
        return {};
      }

      if (operation === "login") {
        await initialize();
        const result = await plugin.login({
          provider: "google",
          options: {
            scopes: [DRIVE_SCOPE],
            style: "bottom",
            filterByAuthorizedAccounts: false,
            autoSelectEnabled: false,
          },
        });

        let token = tokenFromLogin(result);
        if (!token) {
          const authorization = await plugin.getAuthorizationCode({
            provider: "google",
          });
          token = authorization.accessToken;
        }
        if (!token) {
          const error = new Error("Google Drive authorization required");
          Object.assign(error, { code: "LOGIN_REQUIRED" });
          throw error;
        }

        if (drive && result.provider === "google" && result.result.responseType === "online") {
          await drive.rememberAccount({
            email: result.result.profile.email || undefined,
            idToken: result.result.idToken || undefined,
            accessToken: token,
          });
        }
        return {
          token: remember(token),
          signedIn: true,
        };
      }

      const token = await refreshToken(force);
      return {
        token,
        signedIn: true,
      };
    } catch (error) {
      return {
        error: message(error),
        loginRequired: loginRequired(error),
      };
    }
  };
}
