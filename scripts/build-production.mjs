import fs from "node:fs";
import { spawnSync } from "node:child_process";

const refresh = spawnSync(
  "firebase",
  ["projects:list", "--json"],
  { stdio: "ignore" }
);
if (refresh.error || refresh.status !== 0) {
  throw refresh.error || new Error("Could not refresh Firebase CLI credentials");
}

const configPath = process.env.HOME + "/.config/configstore/firebase-tools.json";
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const token = firebaseConfig.tokens?.access_token;
if (!token) throw new Error("Firebase CLI access token missing");

const response = await fetch(
  "https://identitytoolkit.googleapis.com/admin/v2/projects/awesome-89e82/defaultSupportedIdpConfigs/google.com",
  { headers: { Authorization: "Bearer " + token } }
);
if (!response.ok) throw new Error("Could not read Google provider config: " + response.status);

const provider = await response.json();
if (!provider.clientSecret) throw new Error("Google OAuth client secret missing");

const result = spawnSync(
  "npm",
  ["run", "build", "--silent"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_GOOGLE_OAUTH_CLIENT_SECRET: provider.clientSecret
    }
  }
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
