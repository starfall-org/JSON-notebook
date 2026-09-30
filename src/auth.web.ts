import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { firebaseConfig, DRIVE_SCOPE } from "./config";
import { LoginRequired, type Session } from "./session";
const auth = getAuth(initializeApp(firebaseConfig));
const provider = new GoogleAuthProvider();
provider.addScope(DRIVE_SCOPE);
provider.setCustomParameters({ include_granted_scopes: "true" });
const key = "secret-keep.google-session";
let session: Session | null = null;
export async function restoreSession() {
  try {
    session = JSON.parse(
      sessionStorage.getItem(key) || localStorage.getItem(key) || "null",
    );
  } catch {
    session = null;
  }
  return Boolean(session?.accessToken);
}
export async function login() {
  const result = await signInWithPopup(auth, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error("Google không cấp quyền truy cập Drive.");
  session = { accessToken: token, expiresAt: Date.now() + 3_500_000 };
  sessionStorage.setItem(key, JSON.stringify(session));
  localStorage.removeItem(key);
  return true;
}
export async function getAccessToken(force = false) {
  if (!session || force || session.expiresAt <= Date.now() + 60_000)
    throw new LoginRequired(
      "Phiên Drive trên web đã hết hạn. Hãy kết nối lại Google.",
    );
  return session.accessToken;
}
export async function logout() {
  session = null;
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
  await signOut(auth);
}
export { LoginRequired };
