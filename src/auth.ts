// TypeScript resolves this file; Metro selects auth.native.ts or auth.web.ts.
export {
  restoreSession,
  login,
  getAccessToken,
  logout,
  LoginRequired,
} from "./auth.native";
