const COMMANDS: &[&str] = &[
    "open",
    "close",
    "set_rect",
    "set_interactive_regions",
    "navigate",
    "go_back",
    "go_forward",
    "reload",
    "set_color_scheme",
    "fetch_favicon",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
