# Changelog

All notable changes to "Mobile Emulator Manager" will be documented in this file.

## [0.3.0] - 2026-07-21

### Added
- Added Android SDK auto-detection through `ANDROID_SDK_ROOT` and platform-specific default paths for Windows and Linux
- Added cancellable progress notifications and command timeouts for device start, stop, and app installation operations
- Added English and Japanese localization for runtime UI messages, commands, views, and settings
- Added Biome linting and automated tests for Android SDK path resolution
- Added Android 17 (API 37) display support

### Changed
- Fetch iOS Simulators and Android Emulators in parallel to reduce device-list loading time

### Fixed
- Report Android stop operations as failed when the running device's ADB serial cannot be found
- Simplified command error-message selection to improve readability

## [0.2.0] - 2026-07-09

### Changed
- Improved Android emulator state detection by matching running AVD names with active ADB serials
- Improved Android OS and API level detection from AVD metadata
- Made Android AVD configuration parsing more tolerant of whitespace around values
- Refined device selection and error logging for emulator operations
- Replaced the Emulators activity bar icon with a dedicated SVG icon
- Improved Marketplace discoverability with a clearer name, description, categories, keywords, and gallery metadata
- Updated TypeScript from 6.0.3 to 7.0.2

### Fixed
- Fixed Android OS checks used when selecting and operating on emulators
- Removed redundant activation events now generated automatically by VS Code

## [0.1.0] - 2026-06-20

### Added
- Sidebar view to manage iOS Simulators and Android Emulators
- Smart grouping by OS version (e.g., iOS 26.0, Android 16 (API 36))
- Improved Android OS/API version detection from AVD metadata and config files
- Start and stop devices from the sidebar
- Start stopped devices from the Command Palette with an Android/iOS Quick Pick flow
- Install `.apk` files on running Android emulators and `.ipa` files on running iOS simulators
- Start stopped devices and install an app in one flow from the sidebar
- Start stopped devices and install an app in one flow from the Command Palette
- Reinstall the most recently used app per platform with Install Last App
- Copy UDID for iOS Simulators from the context menu
- Copy active ADB serial for running Android emulators
- Configurable Android SDK path via `mobileEmulatorManager.androidSdkPath`
- Helpful error guidance for missing tools, unsupported app files, install failures, and unavailable devices
- Detailed operation and command logs in the Mobile Emulator Manager Output channel
- Japanese README alongside the English README
- Auto-refresh of device status after start/stop and start/install operations
