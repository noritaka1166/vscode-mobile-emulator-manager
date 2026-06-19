# Mobile Emulator Manager

[English README](README.md)

VS Codeのサイドバーから、iOS SimulatorとAndroid Emulatorを一覧表示して操作できます。

## 機能

- **サイドバー統合:** Activity Barから利用できる専用ビューで、iOS / Android端末を一覧表示します。
- **OSバージョン別グループ表示:** `iOS 26.0` や `Android 16 (API 36)` のようにOSバージョンごとに端末を整理して表示します。
- **端末の起動:** サイドバーからワンクリックでSimulator / Emulatorを起動できます。起動完了まで進捗通知を表示します。
- **コマンドパレットから起動:** **Mobile Emulator Manager: Start Device...** を実行すると、Quick Pickから停止中の端末を選んで起動できます。
- **端末の停止:** 実行中のSimulator / Emulatorをサイドバーから停止できます。
- **アプリのインストール:** 実行中のAndroid EmulatorまたはiOS Simulatorを右クリックし、`.apk` または `.ipa` を選んでインストールできます。
- **起動してインストール:** 停止中の端末を右クリックし、アプリファイルを選ぶと、端末を起動してから自動でインストールします。
- **UDIDコピー (iOS):** iOS Simulatorを右クリックしてUDIDをクリップボードへコピーできます。
- **ADB Serialコピー (Android):** 実行中のAndroid Emulatorを右クリックして、`emulator-5554` のようなADB serialをコピーできます。
- **エラー時のガイド:** 起動、停止、インストール、コピー操作に失敗した場合、`adb` 未検出、Android Emulatorツール未検出、Xcode command line toolsの問題、未対応ファイル、端末未起動などの原因に応じたヒントを表示します。

## 必要条件

- **iOS:** Xcodeと `xcrun simctl` command line toolsが必要です。macOSのみ対応です。
- **Android:** Android Studio / Android SDKが必要です。
  - Android SDKの場所は、`mobileEmulatorManager.androidSdkPath` VS Code設定、`ANDROID_HOME`、`~/Library/Android/sdk` の順に参照します。
  - `adb` を実行するために Android SDK Platform-Tools が必要です。
  - AVDの一覧表示と起動のために Android Emulator が必要です。

## 設定

- **`mobileEmulatorManager.androidSdkPath`:** Android SDKへの任意のパスです。SDKが `~/Library/Android/sdk` 以外にある場合や、`ANDROID_HOME` を設定していない場合に指定してください。

## 使い方

1. Activity Barの **Mobile Emulator Manager** アイコンをクリックします。
2. iOS / Android端末がOSバージョンごとに表示されます。
3. 端末横の **Play** または **Stop** ボタンで起動・停止します。
4. コマンドパレットから **Mobile Emulator Manager: Start Device...** を実行すると、Quick Pickから停止中の端末を起動できます。
5. 実行中の端末を右クリックし、**Install App...** を選んで `.apk` または `.ipa` をインストールします。
6. 停止中の端末を右クリックし、**Start and Install App...** を選ぶと、起動からインストールまでまとめて実行できます。
7. iOS Simulatorでは **Copy UDID** で端末IDをコピーできます。
8. 実行中のAndroid Emulatorでは **Copy ADB Serial** でADB serialをコピーできます。

## トラブルシューティング

- Android端末が表示されない場合は、Android Studio、Android SDK、Android Emulator、Android SDK Platform-Toolsがインストールされているか確認してください。
- Android操作で `adb` エラーが出る場合は、`mobileEmulatorManager.androidSdkPath` または `ANDROID_HOME` にAndroid SDKのパスを設定するか、`adb` を `PATH` に追加してください。
- iOS端末が表示されない、または起動に失敗する場合は、Xcodeがインストールされていて、ターミナルから `xcrun simctl` を実行できるか確認してください。
- アプリのインストールに失敗する場合は、Androidには `.apk`、iOS SimulatorにはSimulatorへインストール可能な `.app` を含む `.ipa` を選択してください。
- 端末の状態表示が古い場合は、DevicesビューのRefreshボタンを押してください。

## ライセンス

このプロジェクトはMIT Licenseで公開されています。詳細は [LICENSE](LICENSE) を参照してください。
