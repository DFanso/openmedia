// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-siteview",
    platforms: [
        .macOS(.v10_13),
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "tauri-plugin-siteview",
            type: .static,
            targets: ["tauri-plugin-siteview"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-siteview",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources")
    ]
)
