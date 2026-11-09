// Usage: yarn build                          -> web bundle
//        yarn build ios                      -> iOS app (Xcode signing)
//        yarn build ios --production         -> signed App Store Connect iOS build
//        yarn build android                  -> debug-signed arm64 APK, installable on a device
//        yarn build android --production     -> release AAB for Google Play (needs keystore.properties)
//        yarn build macos                    -> OpenMedia.app
//        yarn build macos --production       -> every macOS bundle (.app and .dmg)
import { spawnSync } from "node:child_process";

const USAGE = `Usage: yarn build [ios|android|macos] [--production]`;

const [target, ...flags] = process.argv.slice(2);
const production = flags.includes("--production");

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const tauri = (...args) => run("yarn", ["tauri", ...args]);

const builds = {
  ios: () => tauri("ios", "build", ...(production ? ["--export-method", "app-store-connect"] : [])),
  android: () =>
    tauri(
      "android",
      "build",
      ...(production ? ["--aab", "--ci"] : ["--apk", "--debug", "--target", "aarch64", "--ci"]),
    ),
  macos: () => tauri("build", ...(production ? [] : ["--bundles", "app"])),
};

if (!target) run("yarn", ["build:web"]);
else if (target in builds) builds[target]();
else {
  console.error(`Unknown target "${target}".\n${USAGE}`);
  process.exit(1);
}
