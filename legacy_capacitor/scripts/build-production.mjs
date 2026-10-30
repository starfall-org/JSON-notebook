import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npm",
  ["run", "build", "--silent"],
  {
    stdio: "inherit",
    env: process.env
  }
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
