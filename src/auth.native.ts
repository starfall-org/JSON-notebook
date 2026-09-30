import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { DRIVE_SCOPE, googleWebClientId } from './config';
import { createTokenManager, LoginRequired } from './session';
// Google Play Services owns the account credential and token renewal. No server auth code.
GoogleSignin.configure({ webClientId: googleWebClientId || undefined, scopes: [DRIVE_SCOPE], offlineAccess: false });
const manager = createTokenManager({
  async read() { return null; },
  async write() { /* Keep access tokens in memory; the native SDK restores the account. */ }
}, async (session, force) => {
  try {
    if (!GoogleSignin.getCurrentUser()) {
      const restored = await GoogleSignin.signInSilently();
      if (restored.type !== "success") throw new LoginRequired('Quyền Google đã bị thu hồi. Vui lòng kết nối lại.');
    }
    if (force && session.accessToken) await GoogleSignin.clearCachedAccessToken(session.accessToken);
    const tokens = await GoogleSignin.getTokens();
    return { accessToken: tokens.accessToken, expiresAt: Date.now() + 2 * 60_000 };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_REQUIRED) throw new LoginRequired('Vui lòng kết nối lại Google.');
    throw error;
  }
});
export async function restoreSession() {
  if (!GoogleSignin.hasPreviousSignIn()) return false;
  // Restore account without an interactive prompt; defer network token retrieval until Drive is used.
  await manager.set({ accessToken: '', expiresAt: 0 });
  return true;
}
export async function login() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result)) return false;
  const tokens = await GoogleSignin.getTokens();
  await manager.set({ accessToken: tokens.accessToken, expiresAt: Date.now() + 2 * 60_000 });
  return true;
}
export const getAccessToken = (force = false) => manager.token(force);
export { LoginRequired };
export async function logout() { await manager.set(null); await GoogleSignin.signOut(); }
