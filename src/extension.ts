import * as vscode from 'vscode';
import { Emulator, EmulatorService } from './emulatorService';
import { EmulatorTreeDataProvider, EmulatorTreeItem } from './treeDataProvider';

const LAST_ANDROID_APP_PATH_KEY = 'lastAndroidAppPath';
const LAST_IOS_APP_PATH_KEY = 'lastIosAppPath';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Mobile Emulator Manager');
    const emulatorService = new EmulatorService(message => logOutput(outputChannel, message));
    const treeDataProvider = new EmulatorTreeDataProvider(emulatorService);
    const treeView = vscode.window.createTreeView('emulatorsView', { treeDataProvider });

    context.subscriptions.push(
        outputChannel,
        treeView,
        treeView.onDidChangeVisibility(event => {
            if (event.visible) {
                logOutput(outputChannel, 'Devices view became visible. Refreshing device tree.');
                treeDataProvider.refresh();
            }
        }),
        vscode.commands.registerCommand('emulators.refresh', () => {
            logOutput(outputChannel, 'Refreshing device tree.');
            treeDataProvider.refresh();
        }),
        vscode.commands.registerCommand('emulators.start', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                await startEmulatorWithProgress(node.emulator, emulatorService, treeDataProvider, outputChannel);
            }
        }),
        vscode.commands.registerCommand('emulators.quickStart', async () => {
            const emulator = await selectStoppedEmulator(emulatorService, 'start', outputChannel);
            if (!emulator) {
                return;
            }

            await startEmulatorWithProgress(emulator, emulatorService, treeDataProvider, outputChannel);
        }),
        vscode.commands.registerCommand('emulators.quickStartAndInstallApp', async () => {
            const emulator = await selectStoppedEmulator(emulatorService, 'start and install to', outputChannel);
            if (!emulator) {
                return;
            }

            const appUri = await selectAppFile(emulator.os);
            if (!appUri) {
                return;
            }

            await startAndInstallAppWithProgress(emulator, appUri.fsPath, emulatorService, treeDataProvider, context, outputChannel);
        }),
        vscode.commands.registerCommand('emulators.quickInstallLastApp', async () => {
            const emulator = await selectRunningEmulator(emulatorService, 'install last app to', outputChannel);
            if (!emulator) {
                return;
            }

            await installLastAppWithProgress(emulator, emulatorService, context, outputChannel);
        }),
        vscode.commands.registerCommand('emulators.stop', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                vscode.window.showInformationMessage(`Stopping ${node.emulator.name}...`);
                logOutput(outputChannel, `Stopping ${formatEmulator(node.emulator)}.`);
                try {
                    await emulatorService.stopEmulator(node.emulator);
                    logOutput(outputChannel, `Stopped ${formatEmulator(node.emulator)} successfully.`);
                    vscode.window.showInformationMessage(`Stopped ${node.emulator.name} successfully.`);
                    treeDataProvider.refresh();
                } catch (e: any) {
                    logOutput(outputChannel, getGuidedErrorMessage(`Failed to stop ${node.emulator.name}`, e));
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
                logOutput(outputChannel, `Installing ${appUri.fsPath} to ${formatEmulator(emulator)}.`);
                try {
                    await emulatorService.installApp(emulator, appUri.fsPath);
                    await saveLastAppPath(context, emulator.os, appUri.fsPath);
                    logOutput(outputChannel, `Installed ${appUri.fsPath} to ${formatEmulator(emulator)} successfully.`);
                    vscode.window.showInformationMessage(`Installed app to ${emulator.name} successfully.`);
                } catch (e: any) {
                    logOutput(outputChannel, getGuidedErrorMessage(`Failed to install app to ${emulator.name}`, e));
                    vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to install app to ${emulator.name}`, e));
                }
            });
        }),
        vscode.commands.registerCommand('emulators.installLastApp', async (node: EmulatorTreeItem) => {
            if (!node?.emulator) {
                return;
            }

            await installLastAppWithProgress(node.emulator, emulatorService, context, outputChannel);
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

            await startAndInstallAppWithProgress(emulator, appUri.fsPath, emulatorService, treeDataProvider, context, outputChannel);
        }),
        vscode.commands.registerCommand('emulators.copyId', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                await vscode.env.clipboard.writeText(node.emulator.id);
                logOutput(outputChannel, `Copied UDID for ${formatEmulator(node.emulator)}: ${node.emulator.id}`);
                vscode.window.showInformationMessage(`Copied UDID: ${node.emulator.id}`);
            }
        }),
        vscode.commands.registerCommand('emulators.copyAndroidSerial', async (node: EmulatorTreeItem) => {
            if (!node?.emulator || node.emulator.os !== 'Android') {
                return;
            }

            try {
                logOutput(outputChannel, `Resolving ADB serial for ${formatEmulator(node.emulator)}.`);
                const serial = await emulatorService.getRunningAndroidSerial(node.emulator.id);
                if (!serial) {
                    logOutput(outputChannel, `ADB serial could not be found for ${formatEmulator(node.emulator)}.`);
                    vscode.window.showWarningMessage(`${node.emulator.name} is not running or its ADB serial could not be found.`);
                    return;
                }

                await vscode.env.clipboard.writeText(serial);
                logOutput(outputChannel, `Copied ADB serial for ${formatEmulator(node.emulator)}: ${serial}`);
                vscode.window.showInformationMessage(`Copied ADB serial: ${serial}`);
            } catch (e: any) {
                logOutput(outputChannel, getGuidedErrorMessage(`Failed to copy ADB serial for ${node.emulator.name}`, e));
                vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to copy ADB serial for ${node.emulator.name}`, e));
            }
        })
    );
}

function logOutput(outputChannel: vscode.OutputChannel, message: string): void {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

function formatEmulator(emulator: Emulator): string {
    return `${emulator.name} (${emulator.os}, ${emulator.id})`;
}

async function selectStoppedEmulator(
    emulatorService: EmulatorService,
    actionLabel: string,
    outputChannel: vscode.OutputChannel
): Promise<Emulator | undefined> {
    logOutput(outputChannel, `Loading devices to ${actionLabel}.`);
    let emulators: Emulator[];
    try {
        emulators = await emulatorService.getEmulators();
    } catch (e: any) {
        logOutput(outputChannel, getGuidedErrorMessage('Failed to load devices', e));
        vscode.window.showErrorMessage(getGuidedErrorMessage('Failed to load devices', e));
        return undefined;
    }

    const stoppedEmulators = emulators.filter(emulator => emulator.state === 'stopped');
    if (stoppedEmulators.length === 0) {
        logOutput(outputChannel, 'No stopped devices are available.');
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
        logOutput(outputChannel, `No stopped ${selectedOs.label} devices are available.`);
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

async function selectRunningEmulator(
    emulatorService: EmulatorService,
    actionLabel: string,
    outputChannel: vscode.OutputChannel
): Promise<Emulator | undefined> {
    logOutput(outputChannel, `Loading devices to ${actionLabel}.`);
    let emulators: Emulator[];
    try {
        emulators = await emulatorService.getEmulators();
    } catch (e: any) {
        logOutput(outputChannel, getGuidedErrorMessage('Failed to load devices', e));
        vscode.window.showErrorMessage(getGuidedErrorMessage('Failed to load devices', e));
        return undefined;
    }

    const runningEmulators = emulators.filter(emulator => emulator.state === 'running');
    if (runningEmulators.length === 0) {
        logOutput(outputChannel, 'No running devices are available.');
        vscode.window.showInformationMessage('No running devices are available.');
        return undefined;
    }

    const selectedOs = await vscode.window.showQuickPick(
        [
            {
                label: 'Android',
                description: `${runningEmulators.filter(emulator => emulator.os === 'Android').length} running`
            },
            {
                label: 'iOS',
                description: `${runningEmulators.filter(emulator => emulator.os === 'iOS').length} running`
            }
        ],
        {
            placeHolder: 'Select a platform'
        }
    );

    if (!selectedOs) {
        return undefined;
    }

    const platformEmulators = runningEmulators.filter(emulator => emulator.os === selectedOs.label);
    if (platformEmulators.length === 0) {
        logOutput(outputChannel, `No running ${selectedOs.label} devices are available.`);
        vscode.window.showInformationMessage(`No running ${selectedOs.label} devices are available.`);
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
    treeDataProvider: EmulatorTreeDataProvider,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Starting ${emulator.name}...`,
        cancellable: false
    }, async () => {
        logOutput(outputChannel, `Starting ${formatEmulator(emulator)}.`);
        try {
            await emulatorService.startEmulator(emulator);
            logOutput(outputChannel, `Started ${formatEmulator(emulator)} successfully.`);
            vscode.window.showInformationMessage(`Started ${emulator.name} successfully.`);
            treeDataProvider.refresh();
        } catch (e: any) {
            logOutput(outputChannel, getGuidedErrorMessage(`Failed to start ${emulator.name}`, e));
            vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to start ${emulator.name}`, e));
        }
    });
}

async function startAndInstallAppWithProgress(
    emulator: Emulator,
    appPath: string,
    emulatorService: EmulatorService,
    treeDataProvider: EmulatorTreeDataProvider,
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Starting ${emulator.name} and installing ${getFileName(appPath)}...`,
        cancellable: false
    }, async () => {
        logOutput(outputChannel, `Starting ${formatEmulator(emulator)} and installing ${appPath}.`);
        try {
            await emulatorService.startEmulator(emulator);
            await emulatorService.installApp(emulator, appPath);
            await saveLastAppPath(context, emulator.os, appPath);
            logOutput(outputChannel, `Started ${formatEmulator(emulator)} and installed ${appPath} successfully.`);
            vscode.window.showInformationMessage(`Started ${emulator.name} and installed app successfully.`);
            treeDataProvider.refresh();
        } catch (e: any) {
            logOutput(outputChannel, getGuidedErrorMessage(`Failed to start and install app to ${emulator.name}`, e));
            vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to start and install app to ${emulator.name}`, e));
        }
    });
}

async function installLastAppWithProgress(
    emulator: Emulator,
    emulatorService: EmulatorService,
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const appPath = getLastAppPath(context, emulator.os);
    if (!appPath) {
        logOutput(outputChannel, `No recent ${getAppFileExtension(emulator.os)} file found for ${emulator.os}.`);
        vscode.window.showInformationMessage(`No recent ${getAppFileExtension(emulator.os)} file found for ${emulator.os}. Use Install App... first.`);
        return;
    }

    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(appPath));
    } catch {
        logOutput(outputChannel, `Last ${emulator.os} app file no longer exists: ${appPath}`);
        vscode.window.showWarningMessage(`The last ${emulator.os} app file no longer exists: ${appPath}`);
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing ${getFileName(appPath)} to ${emulator.name}...`,
        cancellable: false
    }, async () => {
        logOutput(outputChannel, `Installing last app ${appPath} to ${formatEmulator(emulator)}.`);
        try {
            await emulatorService.installApp(emulator, appPath);
            logOutput(outputChannel, `Installed last app ${appPath} to ${formatEmulator(emulator)} successfully.`);
            vscode.window.showInformationMessage(`Installed ${getFileName(appPath)} to ${emulator.name} successfully.`);
        } catch (e: any) {
            logOutput(outputChannel, getGuidedErrorMessage(`Failed to install last app to ${emulator.name}`, e));
            vscode.window.showErrorMessage(getGuidedErrorMessage(`Failed to install last app to ${emulator.name}`, e));
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
