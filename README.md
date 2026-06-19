# Mobile Emulator Manager

[日本語版 README](README.ja.md)

Manage and control your iOS Simulators and Android Emulators directly from the VS Code sidebar!

## Features

- **Sidebar Integration:** View a list of all available iOS and Android devices in the Activity Bar.
- **Smart Grouping:** Devices are neatly grouped by their OS Version (e.g., `iOS 26.0`, `Android 16 (API 36)`), making it easy to find the exact environment you need.
- **Start Devices:** Boot up your simulator/emulator with a single click. A loading indicator will appear, ensuring the device is fully booted and recognized before the status updates.
- **Quick Start from Command Palette:** Run **Mobile Emulator Manager: Start Device...** to choose and start a stopped device without opening the sidebar.
- **Stop Devices:** Shut down running emulators quickly without needing terminal commands.
- **Install Apps:** Right-click a running Android emulator or iOS simulator and select an `.apk` or `.ipa` file to install.
- **Start and Install Apps:** Right-click a stopped device, select an app file, and let the extension start the device before installing it.
- **Copy UDID (iOS):** Right-click any iOS simulator to easily copy its UDID to your clipboard.
- **Copy ADB Serial (Android):** Right-click a running Android emulator to copy its active ADB serial, such as `emulator-5554`.
- **Helpful Error Guidance:** When a start, stop, install, or copy action fails, the extension shows common next steps for issues like missing `adb`, missing Android Emulator tools, Xcode command line tool problems, unsupported app files, or devices that are not running.

## Requirements

- **iOS:** Requires Xcode and `xcrun simctl` command line tools to be installed. (Mac only)
- **Android:** Requires Android Studio / Android SDK to be installed. 
  - By default, the extension uses the `mobileEmulatorManager.androidSdkPath` VS Code setting, then `ANDROID_HOME`, then `~/Library/Android/sdk`.
  - Android SDK Platform-Tools must be available so the extension can run `adb`.
  - Android Emulator must be installed so the extension can list and start AVDs.

## Settings

- **`mobileEmulatorManager.androidSdkPath`:** Optional path to your Android SDK. Use this when your SDK is not in `~/Library/Android/sdk` or `ANDROID_HOME` is not set.

## Usage

1. Open the Activity Bar and click on the **Mobile Emulator Manager** icon (mobile device symbol).
2. You will see a list of iOS and Android devices, categorized by their OS version.
3. Click the **Play** (start) or **Stop** button next to a device to control it.
4. Run **Mobile Emulator Manager: Start Device...** from the Command Palette to start a stopped device from Quick Pick.
5. Right-click a running device and select **Install App...** to choose an `.apk` or `.ipa` file.
6. Right-click a stopped device and select **Start and Install App...** to start it and install an app in one flow.
7. For iOS devices, right-click and select **Copy UDID** to copy the device ID.
8. For running Android emulators, right-click and select **Copy ADB Serial** to copy the active ADB serial.

## Troubleshooting

- If Android devices do not appear, make sure Android Studio, Android SDK, Android Emulator, and Android SDK Platform-Tools are installed.
- If Android actions fail with an `adb` error, set `mobileEmulatorManager.androidSdkPath` or `ANDROID_HOME` to your Android SDK path, or add `adb` to your `PATH`.
- If iOS devices do not appear or fail to start, make sure Xcode is installed and `xcrun simctl` works from your terminal.
- If app installation fails, select an `.apk` for Android and an `.ipa` containing a Simulator-installable `.app` for iOS Simulator.
- If the device state looks stale, use the refresh button in the Devices view.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
