export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export const firebaseConfig = {
  apiKey: "AIzaSyDk6tw0jfgUzfMA0xJHqKzDWU7MWyHF7Zc",
  authDomain: "awesome-89e82.firebaseapp.com",
  projectId: "awesome-89e82",
  storageBucket: "awesome-89e82.firebasestorage.app",
  messagingSenderId: "1064411966305",
  appId: "1:1064411966305:web:5d1ce7688d88112704b320",
};

export const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  "1064411966305-6vuqla6hbp2aegichjdb3d748jqji4be.apps.googleusercontent.com";

export const googleWebClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_GOOGLE_WEB_CLIENT_ID;

export const APP_ORIGIN = "https://awesome-89e82.web.app";
export const AUTH_ORIGIN = "https://awesome-89e82.firebaseapp.com";

export const SESSION_KEY = "secret-keep.google-session";
export const OAUTH_RETURN_KEY = "secrets-keep.oauth-return";
export const OAUTH_AUTO_RECONNECT_KEY = "secrets-keep.oauth-auto-reconnect";
export const OAUTH_BRIDGE_ATTEMPT_KEY = "secrets-keep.oauth-bridge-attempt";

export const AUTH_BRIDGE_PARAM = "__auth_bridge";
export const AUTH_HANDOFF_TOKEN = "__sk_access_token";
export const AUTH_HANDOFF_EXPIRES = "__sk_expires";
export const AUTH_HANDOFF_RETURN = "__sk_return";
export const AUTH_HANDOFF_ERROR = "__sk_auth_error";

export const THEME_KEY = "secret-keep.theme";
export const FOLDER_CACHE_PREFIX = "secrets-keep.folder-cache.v1:";
export const FOLDER_VISIBLE_CACHE_PREFIX = "secrets-keep.folder-visible-cache.v1:";
export const FILE_CACHE_PREFIX = "secrets-keep.file-cache.v1:";
export const CACHE_REFRESH_MS = 30_000;
