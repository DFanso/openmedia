const COMMANDS: &[&str] = &[
    "open",
    "close",
    "set_rect",
    "set_visible",
    "navigate",
    "go_back",
    "go_forward",
    "reload",
    "delete_profile_data",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
