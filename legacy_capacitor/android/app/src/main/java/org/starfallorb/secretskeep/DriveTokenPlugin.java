package org.starfallorb.secretskeep;

import android.accounts.Account;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONObject;

/** Renews Drive access without asking Credential Manager for another ID token. */
@CapacitorPlugin(name = "DriveToken")
public class DriveTokenPlugin extends Plugin {
    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
    private static final String PREFS = "secrets_keep_drive_account";
    private static final String LEGACY_PREFS = "GOOGLE_LOGIN_F13oz0I_SHARED_PERF";
    private static final String LEGACY_DATA = "GOOGLE_LOGIN_GOOGLE_DATA_9158025e-947d-4211-ba51-40451630cc47";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // The email is only an account hint; Google Play Services validates access.
    private String emailFromIdToken(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) return "";
            String payload = new String(Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP), StandardCharsets.UTF_8);
            return new JSONObject(payload).optString("email", "");
        } catch (Exception ignored) {
            return "";
        }
    }

    private JSONObject legacySession() {
        try {
            String data = getContext().getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
                .getString(LEGACY_DATA, "{}");
            return new JSONObject(data);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    @PluginMethod
    public void rememberAccount(PluginCall call) {
        String email = call.getString("email", "");
        if (email.isEmpty()) email = emailFromIdToken(call.getString("idToken", ""));
        if (email.isEmpty()) {
            call.reject("Google account is unavailable", "LOGIN_REQUIRED");
            return;
        }
        preferences().edit().putString("email", email)
            .putString("accessToken", call.getString("accessToken", ""))
            .putBoolean("signedOut", false).apply();
        call.resolve();
    }

    @PluginMethod
    public void clearAccount(PluginCall call) {
        // Prevent migration from resurrecting a session if the social logout fails.
        preferences().edit().clear().putBoolean("signedOut", true).apply();
        call.resolve();
    }

    @PluginMethod
    public void token(PluginCall call) {
        SharedPreferences prefs = preferences();
        String email = prefs.getString("email", "");
        if (email.isEmpty() && !prefs.getBoolean("signedOut", false)) {
            JSONObject legacy = legacySession();
            email = emailFromIdToken(legacy.optString("idToken", ""));
            if (!email.isEmpty()) {
                prefs.edit().putString("email", email)
                    .putString("accessToken", legacy.optString("accessToken", "")).apply();
            }
        }
        if (email.isEmpty()) {
            call.reject("Google Drive authorization required", "LOGIN_REQUIRED");
            return;
        }

        AuthorizationClient client = Identity.getAuthorizationClient(getActivity());
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setAccount(new Account(email, "com.google"))
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
            .build();
        String previous = prefs.getString("accessToken", "");
        if (Boolean.TRUE.equals(call.getBoolean("force", false)) && !previous.isEmpty()) {
            client.clearToken(ClearTokenRequest.builder().setToken(previous).build())
                .addOnSuccessListener(unused -> authorize(client, request, call))
                .addOnFailureListener(error -> call.reject("Cannot clear Google token cache", error));
        } else {
            authorize(client, request, call);
        }
    }

    private void authorize(AuthorizationClient client, AuthorizationRequest request, PluginCall call) {
        client.authorize(request)
            .addOnSuccessListener(result -> {
                // Background renewal must never launch account/consent UI.
                if (result.hasResolution() || result.getAccessToken() == null || result.getAccessToken().isEmpty()) {
                    call.reject("Google Drive authorization required", "LOGIN_REQUIRED");
                    return;
                }
                preferences().edit().putString("accessToken", result.getAccessToken()).apply();
                call.resolve(new JSObject().put("accessToken", result.getAccessToken()));
            })
            .addOnFailureListener(error -> call.reject("Google Drive token renewal failed", error));
    }
}
