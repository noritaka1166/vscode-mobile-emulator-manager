# Mobile Emulator Manager

Manage and control your iOS Simulators and Android Emulators directly from the VS Code sidebar!

## Features

- **Sidebar Integration:** View a list of all available iOS and Android devices in the Activity Bar.
- **Start Devices:** Boot up your simulator/emulator with a single click.
- **Stop Devices:** Shut down running emulators quickly without needing terminal commands.

## Requirements

- **iOS:** Requires Xcode and `xcrun simctl` command line tools to be installed.
- **Android:** Requires Android Studio / Android SDK to be installed. 
  - By default, the extension looks for the Android SDK at `~/Library/Android/sdk` or checks the `ANDROID_HOME` environment variable.

## Setup

1. Open the Activity Bar and click on the **Mobile Emulator Manager** icon (mobile device symbol).
2. You will see a list of iOS and Android devices.
3. Click the Play (start) or Stop button next to a device to control it.

## Publishing to Marketplace

To publish this extension to the VS Code Marketplace:

1. Update the `publisher` field in `package.json` to your publisher name.
2. Install the VSCE CLI: `npm install -g @vscode/vsce`
3. Package the extension: `vsce package`
4. Publish the extension: `vsce publish`

*Make sure to add a custom icon and update the repository link in `package.json` before publishing!*
