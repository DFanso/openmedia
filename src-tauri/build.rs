use std::{collections::HashMap, env, path::Path};

const BUILD_KEYS: [&str; 4] = [
    "OPENMEDIA_RC_KEY_IOS",
    "OPENMEDIA_RC_KEY_ANDROID",
    "OPENMEDIA_DEV_ENTITLEMENT",
    "EXPO_PUBLIC_FORCE_ENABLE_PRO_ON_SIMULATOR",
];

fn main() {
    forward_build_keys();
    tauri_build::build()
}

/// The process environment wins over `../.env`. Missing keys are forwarded empty, which the app
/// reads as "not configured".
fn forward_build_keys() {
    let env_file = Path::new("..").join(".env");
    println!("cargo:rerun-if-changed={}", env_file.display());
    let file: HashMap<String, String> = dotenvy::from_path_iter(&env_file)
        .map(|entries| entries.flatten().collect())
        .unwrap_or_default();
    for name in BUILD_KEYS {
        println!("cargo:rerun-if-env-changed={name}");
        let value = env::var(name)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| file.get(name).cloned())
            .unwrap_or_default();
        println!("cargo:rustc-env={name}={}", value.trim());
    }
}
