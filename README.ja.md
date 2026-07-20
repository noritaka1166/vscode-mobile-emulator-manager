# Mobile Emulator Manager

[English README](README.md)

VS Codeのサイドバーから、iOS SimulatorとAndroid Emulatorを一覧表示して操作できます。

## 機能

- **サイドバー統合:** Activity Barから利用できる専用ビューで、iOS / Android端末を一覧表示します。
- **OSバージョン別グループ表示:** `iOS 26.0` や `Android 17 (API 37)` のようにOSバージョンごとに端末を整理して表示します。
- **端末の起動:** サイドバーからワンクリックでSimulator / Emulatorを起動できます。起動完了まで進捗通知を表示します。
- **タイムアウトとキャンセル:** 起動・停止・インストールの進捗通知から処理をキャンセルできます。外部コマンドが応答しない場合は、無期限に待機せず自動的にタイムアウトします。Android Emulator は起動済みの場合、キャンセル後もバックグラウンドで起動を続けます。
- **ローカライズされたUI:** 実行時メッセージ、コマンド、ビュー、設定は VS Code の表示言語に追従します。英語と日本語の翻訳を収録しています。
- **コマンドパレットから起動:** **Mobile Emulator Manager: 端末を起動...** を実行すると、Android / iOSを選んでから、Quick Pickで停止中の端末を起動できます。
- **コマンドパレットから起動してインストール:** **Mobile Emulator Manager: 起動してアプリをインストール...** を実行すると、停止中の端末を選び、起動後にアプリをインストールできます。
- **端末の停止:** 実行中のSimulator / Emulatorをサイドバーから停止できます。
- **アプリのインストール:** 実行中のAndroid EmulatorまたはiOS Simulatorを右クリックし、`.apk` または `.ipa` を選んでインストールできます。
- **最後に使ったアプリの再インストール:** プラットフォームごとに最後にインストールした `.apk` または `.ipa` を、ファイル選択なしで再インストールできます。
- **コマンドパレットから最後のアプリを再インストール:** **Mobile Emulator Manager: 最後のアプリをインストール...** を実行すると、実行中の端末を選び、最後に使ったアプリを再インストールできます。
- **起動してインストール:** 停止中の端末を右クリックし、アプリファイルを選ぶと、端末を起動してから自動でインストールします。
- **UDIDコピー (iOS):** iOS Simulatorを右クリックしてUDIDをクリップボードへコピーできます。
- **ADB Serialコピー (Android):** 実行中のAndroid Emulatorを右クリックして、`emulator-5554` のようなADB serialをコピーできます。
- **エラー時のガイド:** 起動、停止、インストール、コピー操作に失敗した場合、`adb` 未検出、Android Emulatorツール未検出、Xcode command line toolsの問題、未対応ファイル、端末未起動などの原因に応じたヒントを表示します。
- **詳細ログ:** **Mobile Emulator Manager** Output channelに、操作内容、実行コマンド、失敗時の詳細を記録します。

## 必要条件

- **iOS:** Xcodeと `xcrun simctl` command line toolsが必要です。macOSのみ対応です。
- **Android:** Android Studio / Android SDKが必要です。
  - Android SDKの場所は、`mobileEmulatorManager.androidSdkPath` VS Code設定、`ANDROID_SDK_ROOT`、`ANDROID_HOME`、OSごとの既定パス（macOS: `~/Library/Android/sdk`、Windows: `%LOCALAPPDATA%\Android\Sdk`、Linux: `~/Android/Sdk` または `~/Android/sdk`）の順に参照します。
  - `adb` を実行するために Android SDK Platform-Tools が必要です。
  - AVDの一覧表示と起動のために Android Emulator が必要です。

## 設定

- **`mobileEmulatorManager.androidSdkPath`:** Android SDKへの任意のパスです。環境変数やOSごとの既定パスでSDKが見つからない場合に指定してください。

## 使い方

1. Activity Barの **エミュレータ** アイコンをクリックします。
2. iOS / Android端末がOSバージョンごとに表示されます。
3. 端末横の再生または停止ボタンで起動・停止します。
4. コマンドパレットから **Mobile Emulator Manager: 端末を起動...** を実行し、Android / iOSを選んでから、Quick Pickで停止中の端末を起動できます。
5. コマンドパレットから **Mobile Emulator Manager: 起動してアプリをインストール...** を実行すると、停止中の端末を選び、起動後にアプリをインストールできます。
6. コマンドパレットから **Mobile Emulator Manager: 最後のアプリをインストール...** を実行すると、実行中の端末を選び、そのプラットフォームで最後に使ったアプリを再インストールできます。
7. 実行中の端末を右クリックし、**アプリをインストール...** を選んで `.apk` または `.ipa` をインストールします。
8. 実行中の端末を右クリックし、**最後のアプリをインストール** を選ぶと、そのプラットフォームで最後に使ったアプリを再インストールできます。
9. 停止中の端末を右クリックし、**起動してアプリをインストール...** を選ぶと、起動からインストールまでまとめて実行できます。
10. iOS Simulatorでは **UDID をコピー** で端末IDをコピーできます。
11. 実行中のAndroid Emulatorでは **ADB serial をコピー** でADB serialをコピーできます。

## トラブルシューティング

- Android端末が表示されない場合は、Android Studio、Android SDK、Android Emulator、Android SDK Platform-Toolsがインストールされているか確認してください。
- Android操作で `adb` エラーが出る場合は、`mobileEmulatorManager.androidSdkPath`、`ANDROID_SDK_ROOT`、または `ANDROID_HOME` にAndroid SDKのパスを設定するか、`adb` を `PATH` に追加してください。
- iOS端末が表示されない、または起動に失敗する場合は、Xcodeがインストールされていて、ターミナルから `xcrun simctl` を実行できるか確認してください。
- アプリのインストールに失敗する場合は、Androidには `.apk`、iOS SimulatorにはSimulatorへインストール可能な `.app` を含む `.ipa` を選択してください。
- 端末の状態表示が古い場合は、DevicesビューのRefreshボタンを押してください。
- 実行コマンドや失敗時の詳細を確認したい場合は、VS CodeのOutputパネルで **Mobile Emulator Manager** channelを開いてください。

## ライセンス

このプロジェクトはMIT Licenseで公開されています。詳細は [LICENSE](LICENSE) を参照してください。
