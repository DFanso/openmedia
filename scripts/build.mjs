// Usage: yarn build                  -> web build
//        yarn build ios --production -> signed App Store Connect iOS build
import { spawnSync } from "node:child_process";

const [target, ...flags] = process.argv.slice(2);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!target) run("yarn", ["build:web"]);
else if (target === "ios") {
  const production = flags.includes("--production");
  run("yarn", ["tauri", "ios", "build", ...(production ? ["--export-method", "app-store-connect"] : [])]);
} else {
  console.error(`Unknown target "${target}". Use: yarn build [ios [--production]]`);
  process.exit(1);
}
