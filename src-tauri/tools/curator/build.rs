use std::env;

/// The app library links the Swift billing layer on macOS; Swift's runtime ships with the OS, so
/// this binary (and its tests) must be told where it lives, as the app's own build.rs does.
fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
}
