// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-billing",
    platforms: [
        .macOS(.v10_15),
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "tauri-plugin-billing",
            type: .static,
            targets: ["tauri-plugin-billing"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
        .package(url: "https://github.com/RevenueCat/purchases-ios-spm", from: "5.102.3"),
    ],
    targets: [
        .target(
            name: "tauri-plugin-billing",
            dependencies: [
                .byName(name: "Tauri"),
                .product(name: "RevenueCat", package: "purchases-ios-spm"),
            ],
            path: "Sources")
    ]
)
