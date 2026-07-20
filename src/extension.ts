import * as vscode from 'vscode';
import { type Emulator, EmulatorService } from './emulatorService';
import { EmulatorTreeDataProvider, type EmulatorTreeItem } from './treeDataProvider';

const LAST_ANDROID_APP_PATH_KEY = 'lastAndroidAppPath';
const LAST_IOS_APP_PATH_KEY = 'lastIosAppPath';

type EmulatorState = Emulator['state'];

export function activate(context: vscode.ExtensionContext): void {
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
            const emulator = await selectEmulatorByState(emulatorService, 'stopped', vscode.l10n.t('start'), outputChannel);
            if (!emulator) {
                return;
            }

            await startEmulatorWithProgress(emulator, emulatorService, treeDataProvider, outputChannel);
        }),
        vscode.commands.registerCommand('emulators.quickStartAndInstallApp', async () => {
            const emulator = await selectEmulatorByState(
                emulatorService,
                'stopped',
                vscode.l10n.t('start and install to'),
                outputChannel
            );
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
            const emulator = await selectEmulatorByState(
                emulatorService,
                'running',
                vscode.l10n.t('install last app to'),
                outputChannel
            );
            if (!emulator) {
                return;
            }

            await installLastAppWithProgress(emulator, emulatorService, context, outputChannel);
        }),
        vscode.commands.registerCommand('emulators.stop', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                const emulator = node.emulator;
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: vscode.l10n.t('Stopping {0}...', emulator.name),
                    cancellable: true
                }, async (_progress, cancellationToken) => {
                    await withCancellation(cancellationToken, async signal => {
                        logOutput(outputChannel, `Stopping ${formatEmulator(emulator)}.`);
                        try {
                            await emulatorService.stopEmulator(emulator, signal);
                            logOutput(outputChannel, `Stopped ${formatEmulator(emulator)} successfully.`);
                            showInformationMessage(vscode.l10n.t('Stopped {0} successfully.', emulator.name));
                            treeDataProvider.refresh();
                        } catch (error: unknown) {
                            reportError(outputChannel, vscode.l10n.t('Failed to stop {0}', emulator.name), error);
                        }
                    });
                });
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
                title: vscode.l10n.t('Installing {0} to {1}...', getFileName(appUri.fsPath), emulator.name),
                cancellable: true
            }, async (_progress, cancellationToken) => {
                await withCancellation(cancellationToken, async signal => {
                    logOutput(outputChannel, `Installing ${appUri.fsPath} to ${formatEmulator(emulator)}.`);
                    try {
                        await emulatorService.installApp(emulator, appUri.fsPath, signal);
                        await saveLastAppPath(context, emulator.os, appUri.fsPath);
                        logOutput(outputChannel, `Installed ${appUri.fsPath} to ${formatEmulator(emulator)} successfully.`);
                        showInformationMessage(vscode.l10n.t('Installed app to {0} successfully.', emulator.name));
                    } catch (error: unknown) {
                        reportError(outputChannel, vscode.l10n.t('Failed to install app to {0}', emulator.name), error);
                    }
                });
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
                showInformationMessage(vscode.l10n.t('Copied UDID: {0}', node.emulator.id));
            }
        }),
        vscode.commands.registerCommand('emulators.copyAndroidSerial', async (node: EmulatorTreeItem) => {
            const emulator = node?.emulator;
            if (emulator?.os !== 'Android') {
                return;
            }

            try {
                logOutput(outputChannel, `Resolving ADB serial for ${formatEmulator(emulator)}.`);
                const serial = await emulatorService.getRunningAndroidSerial(emulator.id);
                if (!serial) {
                    logOutput(outputChannel, `ADB serial could not be found for ${formatEmulator(emulator)}.`);
                    showWarningMessage(vscode.l10n.t('{0} is not running or its ADB serial could not be found.', emulator.name));
                    return;
                }

                await vscode.env.clipboard.writeText(serial);
                logOutput(outputChannel, `Copied ADB serial for ${formatEmulator(emulator)}: ${serial}`);
                showInformationMessage(vscode.l10n.t('Copied ADB serial: {0}', serial));
            } catch (error: unknown) {
                reportError(outputChannel, vscode.l10n.t('Failed to copy ADB serial for {0}', emulator.name), error);
            }
        })
    );
}

function logOutput(outputChannel: vscode.OutputChannel, message: string): void {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

async function withCancellation<T>(
    cancellationToken: vscode.CancellationToken,
    operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
    const controller = new AbortController();
    const cancellationDisposable = cancellationToken.onCancellationRequested(() => controller.abort());

    try {
        return await operation(controller.signal);
    } finally {
        cancellationDisposable.dispose();
    }
}

function formatEmulator(emulator: Emulator): string {
    return `${emulator.name} (${emulator.os}, ${emulator.id})`;
}

async function selectEmulatorByState(
    emulatorService: EmulatorService,
    state: EmulatorState,
    actionLabel: string,
    outputChannel: vscode.OutputChannel
): Promise<Emulator | undefined> {
    logOutput(outputChannel, `Loading devices to ${actionLabel}.`);
    let emulators: Emulator[];
    try {
        emulators = await emulatorService.getEmulators();
    } catch (error: unknown) {
        reportError(outputChannel, vscode.l10n.t('Failed to load devices'), error);
        return undefined;
    }

    const stateLabel = getStateLabel(state);
    const stateEmulators = emulators.filter(emulator => emulator.state === state);
    if (stateEmulators.length === 0) {
        logOutput(outputChannel, `No ${state} devices are available.`);
        showInformationMessage(vscode.l10n.t('No {0} devices are available.', stateLabel));
        return undefined;
    }

    const selectedOs = await vscode.window.showQuickPick(
        [
            {
                label: 'Android',
                description: vscode.l10n.t('{0} {1}', stateEmulators.filter(emulator => emulator.os === 'Android').length, stateLabel)
            },
            {
                label: 'iOS',
                description: vscode.l10n.t('{0} {1}', stateEmulators.filter(emulator => emulator.os === 'iOS').length, stateLabel)
            }
        ],
        {
            placeHolder: vscode.l10n.t('Select a platform')
        }
    );

    if (!selectedOs) {
        return undefined;
    }

    const platformEmulators = stateEmulators.filter(emulator => emulator.os === selectedOs.label);
    if (platformEmulators.length === 0) {
        logOutput(outputChannel, `No ${state} ${selectedOs.label} devices are available.`);
        showInformationMessage(vscode.l10n.t('No {0} {1} devices are available.', stateLabel, selectedOs.label));
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
            placeHolder: vscode.l10n.t('Select a {0} device to {1}', selectedOs.label, actionLabel)
        }
    );

    return selected?.emulator;
}

function getStateLabel(state: EmulatorState): string {
    return state === 'running' ? vscode.l10n.t('running') : vscode.l10n.t('stopped');
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
        title: vscode.l10n.t('Starting {0}...', emulator.name),
        cancellable: true
    }, async (_progress, cancellationToken) => {
        await withCancellation(cancellationToken, async signal => {
            logOutput(outputChannel, `Starting ${formatEmulator(emulator)}.`);
            try {
                await emulatorService.startEmulator(emulator, signal);
                logOutput(outputChannel, `Started ${formatEmulator(emulator)} successfully.`);
                showInformationMessage(vscode.l10n.t('Started {0} successfully.', emulator.name));
                treeDataProvider.refresh();
            } catch (error: unknown) {
                reportError(outputChannel, vscode.l10n.t('Failed to start {0}', emulator.name), error);
            }
        });
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
        title: vscode.l10n.t('Starting {0} and installing {1}...', emulator.name, getFileName(appPath)),
        cancellable: true
    }, async (_progress, cancellationToken) => {
        await withCancellation(cancellationToken, async signal => {
            logOutput(outputChannel, `Starting ${formatEmulator(emulator)} and installing ${appPath}.`);
            try {
                await emulatorService.startEmulator(emulator, signal);
                await emulatorService.installApp(emulator, appPath, signal);
                await saveLastAppPath(context, emulator.os, appPath);
                logOutput(outputChannel, `Started ${formatEmulator(emulator)} and installed ${appPath} successfully.`);
                showInformationMessage(vscode.l10n.t('Started {0} and installed app successfully.', emulator.name));
                treeDataProvider.refresh();
            } catch (error: unknown) {
                reportError(outputChannel, vscode.l10n.t('Failed to start and install app to {0}', emulator.name), error);
            }
        });
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
        showInformationMessage(vscode.l10n.t('No recent {0} file found for {1}. Use Install App... first.', getAppFileExtension(emulator.os), emulator.os));
        return;
    }

    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(appPath));
    } catch {
        logOutput(outputChannel, `Last ${emulator.os} app file no longer exists: ${appPath}`);
        showWarningMessage(vscode.l10n.t('The last {0} app file no longer exists: {1}', emulator.os, appPath));
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Installing {0} to {1}...', getFileName(appPath), emulator.name),
        cancellable: true
    }, async (_progress, cancellationToken) => {
        await withCancellation(cancellationToken, async signal => {
            logOutput(outputChannel, `Installing last app ${appPath} to ${formatEmulator(emulator)}.`);
            try {
                await emulatorService.installApp(emulator, appPath, signal);
                logOutput(outputChannel, `Installed last app ${appPath} to ${formatEmulator(emulator)} successfully.`);
                showInformationMessage(vscode.l10n.t('Installed {0} to {1} successfully.', getFileName(appPath), emulator.name));
            } catch (error: unknown) {
                reportError(outputChannel, vscode.l10n.t('Failed to install last app to {0}', emulator.name), error);
            }
        });
    });
}

async function selectAppFile(os: 'iOS' | 'Android'): Promise<vscode.Uri | undefined> {
    const fileSelection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: vscode.l10n.t('Install'),
        filters: os === 'Android'
            ? { [vscode.l10n.t('Android APK')]: ['apk'] }
            : { [vscode.l10n.t('iOS IPA')]: ['ipa'] }
    });

    return fileSelection?.[0];
}

function getGuidedErrorMessage(prefix: string, error: unknown): string {
    const details = getErrorDetails(error);
    const guide = getCauseGuide(details);
    return guide ? `${prefix}: ${details} ${guide}` : `${prefix}: ${details}`;
}

function reportError(outputChannel: vscode.OutputChannel, prefix: string, error: unknown): void {
    if (getErrorDetails(error) === 'Operation cancelled.') {
        logOutput(outputChannel, `${prefix}: Operation cancelled.`);
        showInformationMessage(vscode.l10n.t('Operation cancelled.'));
        return;
    }

    const message = getGuidedErrorMessage(prefix, error);
    logOutput(outputChannel, message);
    vscode.window.showErrorMessage(message);
}

function showInformationMessage(message: string): void {
    vscode.window.showInformationMessage(message);
}

function showWarningMessage(message: string): void {
    vscode.window.showWarningMessage(message);
}

function getErrorDetails(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
        return error.trim();
    }

    return vscode.l10n.t('Unknown error.');
}

function getCauseGuide(details: string): string | undefined {
    const normalized = details.toLowerCase();

    if (matchesAny(normalized, ['adb: command not found', 'adb: not found', 'enoent']) && normalized.includes('adb')) {
        return vscode.l10n.t('Guide: ADB was not found. Install Android SDK Platform-Tools, then set mobileEmulatorManager.androidSdkPath, ANDROID_SDK_ROOT, ANDROID_HOME, or add adb to PATH.');
    }

    if (
        normalized.includes('/emulator/emulator') &&
        matchesAny(normalized, ['no such file', 'not found', 'enoent'])
    ) {
        return vscode.l10n.t('Guide: The Android emulator command was not found. Install Android Emulator in Android Studio and make sure mobileEmulatorManager.androidSdkPath, ANDROID_SDK_ROOT, or ANDROID_HOME points to your SDK.');
    }

    if (normalized.includes('xcrun') && matchesAny(normalized, ['unable to find utility', 'not found', 'xcode-select'])) {
        return vscode.l10n.t('Guide: Xcode command line tools were not found. Install Xcode and check your xcode-select configuration.');
    }

    if (normalized.includes('unable to boot device')) {
        return vscode.l10n.t('Guide: The iOS Simulator could not boot. Check that the device is available in Xcode Devices and Simulators.');
    }

    if (normalized.includes('is not running') || normalized.includes('could not be found')) {
        return vscode.l10n.t('Guide: Check that the target emulator is running, then refresh the device list and try again.');
    }

    if (normalized.includes('please select an .apk file')) {
        return vscode.l10n.t('Guide: Select an .apk file for Android.');
    }

    if (normalized.includes('please select an .ipa file')) {
        return vscode.l10n.t('Guide: Select an .ipa file for iOS Simulator.');
    }

    if (normalized.includes('does not contain a payload directory') || normalized.includes('does not contain an app bundle')) {
        return vscode.l10n.t('Guide: The selected .ipa does not contain a Simulator-installable .app. Choose an app built for iOS Simulator.');
    }

    if (normalized.includes('install_failed') || normalized.includes('failure [')) {
        return vscode.l10n.t('Guide: APK installation failed. Check signing, minSdk, existing app signature mismatch, and device storage.');
    }

    if (normalized.includes('failed to install') && normalized.includes('simctl')) {
        return vscode.l10n.t('Guide: iOS Simulator installation failed. Make sure this is a Simulator build, not a device-only IPA.');
    }

    return undefined;
}

function matchesAny(value: string, needles: string[]): boolean {
    return needles.some(needle => value.includes(needle));
}
