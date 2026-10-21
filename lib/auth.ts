// TypeScript resolves this barrel; Metro selects auth.native.ts or auth.web.ts per platform.
export {
  restoreSession,
  login,
  getAccessToken,
  expireCachedToken,
  logout,
  hasPreviousSignIn,
  LoginRequired,
} from "./auth.native";
