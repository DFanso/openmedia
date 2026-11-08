use std::{collections::HashMap, env, fs, path::Path};

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
    let file = fs::read_to_string(&env_file)
        .map(|text| parse_env_file(&text))
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

fn parse_env_file(text: &str) -> HashMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.starts_with('#') {
                return None;
            }
            let (name, value) = line
                .strip_prefix("export ")
                .unwrap_or(line)
                .split_once('=')?;
            let value = value.trim();
            let value = value
                .strip_prefix('"')
                .and_then(|v| v.strip_suffix('"'))
                .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
                .unwrap_or(value);
            Some((name.trim().to_owned(), value.to_owned()))
        })
        .collect()
}
