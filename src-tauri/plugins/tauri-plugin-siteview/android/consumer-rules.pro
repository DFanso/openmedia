# The plugin is loaded by name from Rust, so its class and its command methods must survive
# shrinking. The rules mirror what the Tauri plugin template ships.
-keep class surf.openmedia.siteview.SiteViewPlugin { *; }
-keepclassmembers class surf.openmedia.siteview.** {
    @app.tauri.annotation.Command <methods>;
}
