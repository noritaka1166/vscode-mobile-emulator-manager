import * as vscode from 'vscode';
import { EmulatorService } from './emulatorService';
import { EmulatorTreeDataProvider, EmulatorTreeItem } from './treeDataProvider';

export function activate(context: vscode.ExtensionContext) {
    const emulatorService = new EmulatorService();
    const treeDataProvider = new EmulatorTreeDataProvider(emulatorService);
    
    vscode.window.registerTreeDataProvider('emulatorsView', treeDataProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('emulators.refresh', () => {
            treeDataProvider.refresh();
        }),
        vscode.commands.registerCommand('emulators.start', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                const emulator = node.emulator;
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Starting ${emulator.name}...`,
                    cancellable: false
                }, async (progress) => {
                    try {
                        await emulatorService.startEmulator(emulator);
                        vscode.window.showInformationMessage(`Started ${emulator.name} successfully.`);
                        treeDataProvider.refresh();
                    } catch (e: any) {
                        vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to start ${emulator.name}`, e));
                    }
                });
            }
        }),
        vscode.commands.registerCommand('emulators.stop', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                vscode.window.showInformationMessage(`Stopping ${node.emulator.name}...`);
                try {
                    await emulatorService.stopEmulator(node.emulator);
                    vscode.window.showInformationMessage(`Stopped ${node.emulator.name} successfully.`);
                    treeDataProvider.refresh();
                } catch (e: any) {
                    vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to stop ${node.emulator.name}`, e));
                }
            }
        }),
        vscode.commands.registerCommand('emulators.installApp', async (node: EmulatorTreeItem) => {
            if (!node?.emulator) {
                return;
            }

            const emulator = node.emulator;
            const fileSelection = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                openLabel: 'Install',
                filters: emulator.os === 'Android'
                    ? { 'Android APK': ['apk'] }
                    : { 'iOS IPA': ['ipa'] }
            });

            const appUri = fileSelection?.[0];
            if (!appUri) {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${appUri.fsPath.split(/[\\/]/).pop()} to ${emulator.name}...`,
                cancellable: false
            }, async () => {
                try {
                    await emulatorService.installApp(emulator, appUri.fsPath);
                    vscode.window.showInformationMessage(`Installed app to ${emulator.name} successfully.`);
                } catch (e: any) {
                    vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to install app to ${emulator.name}`, e));
                }
            });
        }),
        vscode.commands.registerCommand('emulators.copyId', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                await vscode.env.clipboard.writeText(node.emulator.id);
                vscode.window.showInformationMessage(`Copied UDID: ${node.emulator.id}`);
            }
        }),
        vscode.commands.registerCommand('emulators.copyAndroidSerial', async (node: EmulatorTreeItem) => {
            if (!node?.emulator || node.emulator.os !== 'Android') {
                return;
            }

            try {
                const serial = await emulatorService.getRunningAndroidSerial(node.emulator.id);
                if (!serial) {
                    vscode.window.showWarningMessage(`${node.emulator.name} is not running or its ADB serial could not be found.`);
                    return;
                }

                await vscode.env.clipboard.writeText(serial);
                vscode.window.showInformationMessage(`Copied ADB serial: ${serial}`);
            } catch (e: any) {
                vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to copy ADB serial for ${node.emulator.name}`, e));
            }
        })
    );
}

function getGuidedErrorMessage(prefix: string, error: unknown): string {
    const details = getErrorDetails(error);
    const guide = getCauseGuide(details);
    return guide ? `${prefix}: ${details} ${guide}` : `${prefix}: ${details}`;
}

function getErrorDetails(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
        return error.trim();
    }

    return 'Unknown error.';
}

function getCauseGuide(details: string): string | undefined {
    const normalized = details.toLowerCase();

    if (matchesAny(normalized, ['adb: command not found', 'adb: not found', 'enoent']) && normalized.includes('adb')) {
        return 'Guide: ADB was not found. Install Android SDK Platform-Tools, then set ANDROID_HOME or add adb to PATH.';
    }

    if (
        normalized.includes('/emulator/emulator') &&
        matchesAny(normalized, ['no such file', 'not found', 'enoent'])
    ) {
        return 'Guide: The Android emulator command was not found. Install Android Emulator in Android Studio and make sure ANDROID_HOME points to your SDK.';
    }

    if (normalized.includes('xcrun') && matchesAny(normalized, ['unable to find utility', 'not found', 'xcode-select'])) {
        return 'Guide: Xcode command line tools were not found. Install Xcode and check your xcode-select configuration.';
    }

    if (normalized.includes('unable to boot device')) {
        return 'Guide: The iOS Simulator could not boot. Check that the device is available in Xcode Devices and Simulators.';
    }

    if (normalized.includes('is not running') || normalized.includes('could not be found')) {
        return 'Guide: Check that the target emulator is running, then refresh the device list and try again.';
    }

    if (normalized.includes('please select an .apk file')) {
        return 'Guide: Select an .apk file for Android.';
    }

    if (normalized.includes('please select an .ipa file')) {
        return 'Guide: Select an .ipa file for iOS Simulator.';
    }

    if (normalized.includes('does not contain a payload directory') || normalized.includes('does not contain an app bundle')) {
        return 'Guide: The selected .ipa does not contain a Simulator-installable .app. Choose an app built for iOS Simulator.';
    }

    if (normalized.includes('install_failed') || normalized.includes('failure [')) {
        return 'Guide: APK installation failed. Check signing, minSdk, existing app signature mismatch, and device storage.';
    }

    if (normalized.includes('failed to install') && normalized.includes('simctl')) {
        return 'Guide: iOS Simulator installation failed. Make sure this is a Simulator build, not a device-only IPA.';
    }

    return undefined;
}

function matchesAny(value: string, needles: string[]): boolean {
    return needles.some(needle => value.includes(needle));
}

export function deactivate() {}
