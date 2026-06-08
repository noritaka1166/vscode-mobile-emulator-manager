# Mobile Emulator Manager

Manage and control your iOS Simulators and Android Emulators directly from the VS Code sidebar!

## Features

- **Sidebar Integration:** View a list of all available iOS and Android devices in the Activity Bar.
- **Smart Grouping:** Devices are neatly grouped by their OS Version (e.g., `iOS 26.0`, `Android 16 (API 36)`), making it easy to find the exact environment you need.
- **Start Devices:** Boot up your simulator/emulator with a single click. A loading indicator will appear, ensuring the device is fully booted and recognized before the status updates.
- **Stop Devices:** Shut down running emulators quickly without needing terminal commands.
- **Install Apps:** Right-click a running Android emulator or iOS simulator and select an `.apk` or `.ipa` file to install.
- **Copy UDID (iOS):** Right-click any iOS simulator to easily copy its UDID to your clipboard.

## Requirements

- **iOS:** Requires Xcode and `xcrun simctl` command line tools to be installed. (Mac only)
- **Android:** Requires Android Studio / Android SDK to be installed. 
  - By default, the extension looks for the Android SDK at `~/Library/Android/sdk` or checks the `ANDROID_HOME` environment variable.

## Usage

1. Open the Activity Bar and click on the **Mobile Emulator Manager** icon (mobile device symbol).
2. You will see a list of iOS and Android devices, categorized by their OS version.
3. Click the **Play** (start) or **Stop** button next to a device to control it.
4. Right-click a running device and select **Install App...** to choose an `.apk` or `.ipa` file.
5. For iOS devices, right-click and select **Copy UDID** to copy the device ID.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
