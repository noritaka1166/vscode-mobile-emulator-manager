import * as vscode from 'vscode';
import { Emulator, EmulatorService } from './emulatorService';
import { EmulatorTreeDataProvider, EmulatorTreeItem } from './treeDataProvider';

const LAST_ANDROID_APP_PATH_KEY = 'lastAndroidAppPath';
const LAST_IOS_APP_PATH_KEY = 'lastIosAppPath';

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
                await startEmulatorWithProgress(node.emulator, emulatorService, treeDataProvider);
            }
        }),
        vscode.commands.registerCommand('emulators.quickStart', async () => {
            const emulator = await selectStoppedEmulator(emulatorService, 'start');
            if (!emulator) {
                return;
            }

            await startEmulatorWithProgress(emulator, emulatorService, treeDataProvider);
        }),
        vscode.commands.registerCommand('emulators.quickStartAndInstallApp', async () => {
            const emulator = await selectStoppedEmulator(emulatorService, 'start and install to');
            if (!emulator) {
                return;
            }

            const appUri = await selectAppFile(emulator.os);
            if (!appUri) {
                return;
            }

            await startAndInstallAppWithProgress(emulator, appUri.fsPath, emulatorService, treeDataProvider, context);
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
            const appUri = await selectAppFile(emulator.os);
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
                    await saveLastAppPath(context, emulator.os, appUri.fsPath);
                    vscode.window.showInformationMessage(`Installed app to ${emulator.name} successfully.`);
                } catch (e: any) {
                    vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to install app to ${emulator.name}`, e));
                }
            });
        }),
        vscode.commands.registerCommand('emulators.installLastApp', async (node: EmulatorTreeItem) => {
            if (!node?.emulator) {
                return;
            }

            const emulator = node.emulator;
            const appPath = getLastAppPath(context, emulator.os);
            if (!appPath) {
                vscode.window.showInformationMessage(`No recent ${getAppFileExtension(emulator.os)} file found for ${emulator.os}. Use Install App... first.`);
                return;
            }

            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(appPath));
            } catch {
                vscode.window.showWarningMessage(`The last ${emulator.os} app file no longer exists: ${appPath}`);
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${getFileName(appPath)} to ${emulator.name}...`,
                cancellable: false
            }, async () => {
                try {
                    await emulatorService.installApp(emulator, appPath);
                    vscode.window.showInformationMessage(`Installed ${getFileName(appPath)} to ${emulator.name} successfully.`);
                } catch (e: any) {
                    vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to install last app to ${emulator.name}`, e));
                }
            });
        }),
        vscode.commands.registerCommand('emulators.startAndInstallApp', async (node: EmulatorTreeItem) => {
            if (!node?.emulator) {
                return;
            }

            const emulator = node.emulator;
            const appUri = await selectAppFile(emulator.os);
            if (!appUri) {
                return;
            }

            await startAndInstallAppWithProgress(emulator, appUri.fsPath, emulatorService, treeDataProvider, context);
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

async function selectStoppedEmulator(emulatorService: EmulatorService, actionLabel: string): Promise<Emulator | undefined> {
    let emulators: Emulator[];
    try {
        emulators = await emulatorService.getEmulators();
    } catch (e: any) {
        vscode.window.showErrorMessage(getGuidedErrorMessage('Failed to load devices', e));
        return undefined;
    }

    const stoppedEmulators = emulators.filter(emulator => emulator.state === 'stopped');
    if (stoppedEmulators.length === 0) {
        vscode.window.showInformationMessage('No stopped devices are available.');
        return undefined;
    }

    const selectedOs = await vscode.window.showQuickPick(
        [
            {
                label: 'Android',
                description: `${stoppedEmulators.filter(emulator => emulator.os === 'Android').length} stopped`
            },
            {
                label: 'iOS',
                description: `${stoppedEmulators.filter(emulator => emulator.os === 'iOS').length} stopped`
            }
        ],
        {
            placeHolder: 'Select a platform'
        }
    );

    if (!selectedOs) {
        return undefined;
    }

    const platformEmulators = stoppedEmulators.filter(emulator => emulator.os === selectedOs.label);
    if (platformEmulators.length === 0) {
        vscode.window.showInformationMessage(`No stopped ${selectedOs.label} devices are available.`);
        return undefined;
    }

    const selected = await vscode.window.showQuickPick(
        platformEmulators.map(emulator => ({
            label: emulator.name,
            description: emulator.osVersion || emulator.os,
            detail: `${emulator.os} • ${emulator.id}`,
            emulator
        })),
        {
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: `Select a ${selectedOs.label} device to ${actionLabel}`
        }
    );

    return selected?.emulator;
}

function getLastAppPath(context: vscode.ExtensionContext, os: 'iOS' | 'Android'): string | undefined {
    return context.globalState.get<string>(getLastAppPathKey(os));
}

async function saveLastAppPath(context: vscode.ExtensionContext, os: 'iOS' | 'Android', appPath: string): Promise<void> {
    await context.globalState.update(getLastAppPathKey(os), appPath);
}

function getLastAppPathKey(os: 'iOS' | 'Android'): string {
    return os === 'Android' ? LAST_ANDROID_APP_PATH_KEY : LAST_IOS_APP_PATH_KEY;
}

function getAppFileExtension(os: 'iOS' | 'Android'): string {
    return os === 'Android' ? '.apk' : '.ipa';
}

function getFileName(filePath: string): string {
    return filePath.split(/[\\/]/).pop() || filePath;
}

async function startEmulatorWithProgress(
    emulator: Emulator,
    emulatorService: EmulatorService,
    treeDataProvider: EmulatorTreeDataProvider
): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Starting ${emulator.name}...`,
        cancellable: false
    }, async () => {
        try {
            await emulatorService.startEmulator(emulator);
            vscode.window.showInformationMessage(`Started ${emulator.name} successfully.`);
            treeDataProvider.refresh();
        } catch (e: any) {
            vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to start ${emulator.name}`, e));
        }
    });
}

async function startAndInstallAppWithProgress(
    emulator: Emulator,
    appPath: string,
    emulatorService: EmulatorService,
    treeDataProvider: EmulatorTreeDataProvider,
    context: vscode.ExtensionContext
): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Starting ${emulator.name} and installing ${getFileName(appPath)}...`,
        cancellable: false
    }, async () => {
        try {
            await emulatorService.startEmulator(emulator);
            await emulatorService.installApp(emulator, appPath);
            await saveLastAppPath(context, emulator.os, appPath);
            vscode.window.showInformationMessage(`Started ${emulator.name} and installed app successfully.`);
            treeDataProvider.refresh();
        } catch (e: any) {
            vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to start and install app to ${emulator.name}`, e));
        }
    });
}

async function selectAppFile(os: 'iOS' | 'Android'): Promise<vscode.Uri | undefined> {
    const fileSelection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Install',
        filters: os === 'Android'
            ? { 'Android APK': ['apk'] }
            : { 'iOS IPA': ['ipa'] }
    });

    return fileSelection?.[0];
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
        return 'Guide: ADB was not found. Install Android SDK Platform-Tools, then set mobileEmulatorManager.androidSdkPath, ANDROID_HOME, or add adb to PATH.';
    }

    if (
        normalized.includes('/emulator/emulator') &&
        matchesAny(normalized, ['no such file', 'not found', 'enoent'])
    ) {
        return 'Guide: The Android emulator command was not found. Install Android Emulator in Android Studio and make sure mobileEmulatorManager.androidSdkPath or ANDROID_HOME points to your SDK.';
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
