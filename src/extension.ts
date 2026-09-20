import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import {
    ANDROID_GPU_MODES,
    type AndroidLaunchOptions,
    type AndroidLaunchProfile,
    getAndroidLaunchProfiles,
    normalizeAndroidLaunchOptions,
    normalizeAndroidLaunchProfileName,
} from "./androidSdk";
import { type Emulator, EmulatorService } from "./emulatorService";
import { getFavoriteEmulatorKey, getFavoriteEmulatorKeys } from "./favorites";
import {
    EmulatorTreeDataProvider,
    type EmulatorTreeItem,
} from "./treeDataProvider";

const LAST_ANDROID_APP_PATH_KEY = "lastAndroidAppPath";
const LAST_IOS_APP_PATH_KEY = "lastIosAppPath";
const ANDROID_LAUNCH_OPTIONS_KEY = "androidLaunchOptions";
const ANDROID_LAUNCH_PROFILES_KEY = "androidLaunchProfiles";
const FAVORITE_EMULATOR_KEYS = "favoriteEmulatorKeys";

type EmulatorState = Emulator["state"];

export function activate(context: vscode.ExtensionContext): void {
    const outputChannel = vscode.window.createOutputChannel(
        "Mobile Emulator Manager",
    );
    const emulatorService = new EmulatorService((message) =>
        logOutput(outputChannel, message),
    );
    emulatorService.setDefaultAndroidLaunchOptions(
        context.globalState.get<unknown>(ANDROID_LAUNCH_OPTIONS_KEY),
    );
    const favoriteEmulatorKeys = getFavoriteEmulatorKeys(
        context.globalState.get<unknown>(FAVORITE_EMULATOR_KEYS),
    );
    const treeDataProvider = new EmulatorTreeDataProvider(
        emulatorService,
        favoriteEmulatorKeys,
    );
    const treeView = vscode.window.createTreeView("emulatorsView", {
        treeDataProvider,
    });
    const updateFavorite = async (
        node: EmulatorTreeItem | undefined,
        favorite: boolean,
    ): Promise<void> => {
        if (!node?.emulator) {
            return;
        }

        const key = getFavoriteEmulatorKey(node.emulator);
        if (favorite) {
            favoriteEmulatorKeys.add(key);
        } else {
            favoriteEmulatorKeys.delete(key);
        }
        await context.globalState.update(
            FAVORITE_EMULATOR_KEYS,
            Array.from(favoriteEmulatorKeys).sort((a, b) => a.localeCompare(b)),
        );
        treeDataProvider.setFavoriteEmulatorKeys(favoriteEmulatorKeys);
    };

    context.subscriptions.push(
        outputChannel,
        treeView,
        treeView.onDidChangeVisibility((event) => {
            if (event.visible) {
                logOutput(
                    outputChannel,
                    "Devices view became visible. Refreshing device tree.",
                );
                treeDataProvider.refresh();
            }
        }),
        vscode.commands.registerCommand("emulators.refresh", () => {
            logOutput(outputChannel, "Refreshing device tree.");
            treeDataProvider.refresh();
        }),
        vscode.commands.registerCommand(
            "emulators.addFavorite",
            async (node: EmulatorTreeItem) => updateFavorite(node, true),
        ),
        vscode.commands.registerCommand(
            "emulators.removeFavorite",
            async (node: EmulatorTreeItem) => updateFavorite(node, false),
        ),
        vscode.commands.registerCommand(
            "emulators.start",
            async (node: EmulatorTreeItem) => {
                if (node?.emulator) {
                    await startEmulatorWithProgress(
                        node.emulator,
                        emulatorService,
                        treeDataProvider,
                        outputChannel,
                    );
                }
            },
        ),
        vscode.commands.registerCommand("emulators.quickStart", async () => {
            const emulator = await selectEmulatorByState(
                emulatorService,
                "stopped",
                vscode.l10n.t("start"),
                outputChannel,
            );
            if (!emulator) {
                return;
            }

            await startEmulatorWithProgress(
                emulator,
                emulatorService,
                treeDataProvider,
                outputChannel,
            );
        }),
        vscode.commands.registerCommand(
            "emulators.coldStart",
            async (node?: EmulatorTreeItem) => {
                const emulator =
                    node?.emulator ||
                    (await selectEmulatorByState(
                        emulatorService,
                        "stopped",
                        vscode.l10n.t("cold boot"),
                        outputChannel,
                        "Android",
                    ));
                if (emulator?.os !== "Android") {
                    return;
                }

                await startEmulatorWithProgress(
                    emulator,
                    emulatorService,
                    treeDataProvider,
                    outputChannel,
                    { coldBoot: true },
                );
            },
        ),
        vscode.commands.registerCommand(
            "emulators.moreActions",
            async (node?: EmulatorTreeItem) => {
                const emulator = node?.emulator;
                if (emulator?.state !== "stopped") {
                    return;
                }

                const actions: Array<{
                    label: string;
                    description: string;
                    command: string;
                }> = [
                    {
                        label: vscode.l10n.t("Start and Install App..."),
                        description: vscode.l10n.t(
                            "Start this device, then select an app to install.",
                        ),
                        command: "emulators.startAndInstallApp",
                    },
                ];
                if (emulator.os === "Android") {
                    const profiles = getAndroidLaunchProfiles(
                        context.globalState.get<unknown>(
                            ANDROID_LAUNCH_PROFILES_KEY,
                        ),
                    );
                    actions.unshift(
                        {
                            label: vscode.l10n.t(
                                "Start with Launch Options...",
                            ),
                            description: vscode.l10n.t(
                                "Choose startup settings such as GPU mode and memory.",
                            ),
                            command: "emulators.startWithLaunchOptions",
                        },
                        {
                            label: vscode.l10n.t("Cold Boot"),
                            description: vscode.l10n.t(
                                "Start without loading the saved snapshot.",
                            ),
                            command: "emulators.coldStart",
                        },
                    );
                    if (profiles.length > 0) {
                        actions.unshift({
                            label: vscode.l10n.t("Start with Profile..."),
                            description: vscode.l10n.t(
                                "Choose a saved Android launch profile.",
                            ),
                            command: "emulators.startWithLaunchProfile",
                        });
                    }
                }

                const action = await vscode.window.showQuickPick(actions, {
                    placeHolder: vscode.l10n.t("Select an action"),
                });
                if (action) {
                    await vscode.commands.executeCommand(action.command, node);
                }
            },
        ),
        vscode.commands.registerCommand(
            "emulators.startWithLaunchOptions",
            async (node?: EmulatorTreeItem) => {
                const emulator =
                    node?.emulator ||
                    (await selectEmulatorByState(
                        emulatorService,
                        "stopped",
                        vscode.l10n.t("start with launch options"),
                        outputChannel,
                        "Android",
                    ));
                if (emulator?.os !== "Android") {
                    return;
                }

                const launchOptions = await selectAndroidLaunchOptions(
                    context,
                    (options) =>
                        emulatorService.setDefaultAndroidLaunchOptions(options),
                );
                if (!launchOptions) {
                    return;
                }

                await startEmulatorWithProgress(
                    emulator,
                    emulatorService,
                    treeDataProvider,
                    outputChannel,
                    launchOptions,
                );
            },
        ),
        vscode.commands.registerCommand(
            "emulators.startWithLaunchProfile",
            async (node?: EmulatorTreeItem) => {
                const emulator =
                    node?.emulator ||
                    (await selectEmulatorByState(
                        emulatorService,
                        "stopped",
                        vscode.l10n.t("start with profile"),
                        outputChannel,
                        "Android",
                    ));
                if (emulator?.os !== "Android") {
                    return;
                }

                const profiles = getAndroidLaunchProfiles(
                    context.globalState.get<unknown>(
                        ANDROID_LAUNCH_PROFILES_KEY,
                    ),
                );
                const selected = await vscode.window.showQuickPick(
                    profiles.map((profile) => ({
                        label: profile.name,
                        description: formatAndroidLaunchProfile(
                            profile.options,
                        ),
                        profile,
                    })),
                    {
                        placeHolder: vscode.l10n.t("Select a launch profile"),
                    },
                );
                if (!selected) {
                    return;
                }

                await startEmulatorWithProgress(
                    emulator,
                    emulatorService,
                    treeDataProvider,
                    outputChannel,
                    selected.profile.options,
                );
            },
        ),
        vscode.commands.registerCommand(
            "emulators.quickStartAndInstallApp",
            async () => {
                const emulator = await selectEmulatorByState(
                    emulatorService,
                    "stopped",
                    vscode.l10n.t("start and install to"),
                    outputChannel,
                );
                if (!emulator) {
                    return;
                }

                const appUri = await selectAppFile(emulator.os);
                if (!appUri) {
                    return;
                }

                await startAndInstallAppWithProgress(
                    emulator,
                    appUri.fsPath,
                    emulatorService,
                    treeDataProvider,
                    context,
                    outputChannel,
                );
            },
        ),
        vscode.commands.registerCommand(
            "emulators.quickInstallLastApp",
            async () => {
                const emulator = await selectEmulatorByState(
                    emulatorService,
                    "running",
                    vscode.l10n.t("install last app to"),
                    outputChannel,
                );
                if (!emulator) {
                    return;
                }

                await installLastAppWithProgress(
                    emulator,
                    emulatorService,
                    context,
                    outputChannel,
                );
            },
        ),
        vscode.commands.registerCommand(
            "emulators.stop",
            async (node: EmulatorTreeItem) => {
                if (node?.emulator) {
                    const emulator = node.emulator;
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: vscode.l10n.t(
                                "Stopping {0}...",
                                emulator.name,
                            ),
                            cancellable: true,
                        },
                        async (_progress, cancellationToken) => {
                            await withCancellation(
                                cancellationToken,
                                async (signal) => {
                                    logOutput(
                                        outputChannel,
                                        `Stopping ${formatEmulator(emulator)}.`,
                                    );
                                    try {
                                        await emulatorService.stopEmulator(
                                            emulator,
                                            signal,
                                        );
                                        logOutput(
                                            outputChannel,
                                            `Stopped ${formatEmulator(emulator)} successfully.`,
                                        );
                                        showInformationMessage(
                                            vscode.l10n.t(
                                                "Stopped {0} successfully.",
                                                emulator.name,
                                            ),
                                        );
                                        treeDataProvider.refresh();
                                    } catch (error: unknown) {
                                        reportError(
                                            outputChannel,
                                            vscode.l10n.t(
                                                "Failed to stop {0}",
                                                emulator.name,
                                            ),
                                            error,
                                        );
                                    }
                                },
                            );
                        },
                    );
                }
            },
        ),
        vscode.commands.registerCommand(
            "emulators.installApp",
            async (node: EmulatorTreeItem) => {
                if (!node?.emulator) {
                    return;
                }

                const emulator = node.emulator;
                const appUri = await selectAppFile(emulator.os);
                if (!appUri) {
                    return;
                }

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: vscode.l10n.t(
                            "Installing {0} to {1}...",
                            getFileName(appUri.fsPath),
                            emulator.name,
                        ),
                        cancellable: true,
                    },
                    async (_progress, cancellationToken) => {
                        await withCancellation(
                            cancellationToken,
                            async (signal) => {
                                logOutput(
                                    outputChannel,
                                    `Installing ${appUri.fsPath} to ${formatEmulator(emulator)}.`,
                                );
                                try {
                                    await emulatorService.installApp(
                                        emulator,
                                        appUri.fsPath,
                                        signal,
                                    );
                                    await saveLastAppPath(
                                        context,
                                        emulator.os,
                                        appUri.fsPath,
                                    );
                                    logOutput(
                                        outputChannel,
                                        `Installed ${appUri.fsPath} to ${formatEmulator(emulator)} successfully.`,
                                    );
                                    showInformationMessage(
                                        vscode.l10n.t(
                                            "Installed app to {0} successfully.",
                                            emulator.name,
                                        ),
                                    );
                                } catch (error: unknown) {
                                    reportError(
                                        outputChannel,
                                        vscode.l10n.t(
                                            "Failed to install app to {0}",
                                            emulator.name,
                                        ),
                                        error,
                                    );
                                }
                            },
                        );
                    },
                );
            },
        ),
        vscode.commands.registerCommand(
            "emulators.installLastApp",
            async (node: EmulatorTreeItem) => {
                if (!node?.emulator) {
                    return;
                }

                await installLastAppWithProgress(
                    node.emulator,
                    emulatorService,
                    context,
                    outputChannel,
                );
            },
        ),
        vscode.commands.registerCommand(
            "emulators.startAndInstallApp",
            async (node: EmulatorTreeItem) => {
                if (!node?.emulator) {
                    return;
                }

                const emulator = node.emulator;
                const appUri = await selectAppFile(emulator.os);
                if (!appUri) {
                    return;
                }

                await startAndInstallAppWithProgress(
                    emulator,
                    appUri.fsPath,
                    emulatorService,
                    treeDataProvider,
                    context,
                    outputChannel,
                );
            },
        ),
        vscode.commands.registerCommand(
            "emulators.copyId",
            async (node: EmulatorTreeItem) => {
                if (node?.emulator) {
                    await vscode.env.clipboard.writeText(node.emulator.id);
                    logOutput(
                        outputChannel,
                        `Copied UDID for ${formatEmulator(node.emulator)}: ${node.emulator.id}`,
                    );
                    showInformationMessage(
                        vscode.l10n.t("Copied UDID: {0}", node.emulator.id),
                    );
                }
            },
        ),
        vscode.commands.registerCommand(
            "emulators.copyAndroidSerial",
            async (node: EmulatorTreeItem) => {
                const emulator = node?.emulator;
                if (emulator?.os !== "Android") {
                    return;
                }

                try {
                    logOutput(
                        outputChannel,
                        `Resolving ADB serial for ${formatEmulator(emulator)}.`,
                    );
                    const serial =
                        await emulatorService.getRunningAndroidSerial(
                            emulator.id,
                        );
                    if (!serial) {
                        logOutput(
                            outputChannel,
                            `ADB serial could not be found for ${formatEmulator(emulator)}.`,
                        );
                        showWarningMessage(
                            vscode.l10n.t(
                                "{0} is not running or its ADB serial could not be found.",
                                emulator.name,
                            ),
                        );
                        return;
                    }

                    await vscode.env.clipboard.writeText(serial);
                    logOutput(
                        outputChannel,
                        `Copied ADB serial for ${formatEmulator(emulator)}: ${serial}`,
                    );
                    showInformationMessage(
                        vscode.l10n.t("Copied ADB serial: {0}", serial),
                    );
                } catch (error: unknown) {
                    reportError(
                        outputChannel,
                        vscode.l10n.t(
                            "Failed to copy ADB serial for {0}",
                            emulator.name,
                        ),
                        error,
                    );
                }
            },
        ),
    );
}

function logOutput(outputChannel: vscode.OutputChannel, message: string): void {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

async function withCancellation<T>(
    cancellationToken: vscode.CancellationToken,
    operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    const controller = new AbortController();
    const cancellationDisposable = cancellationToken.onCancellationRequested(
        () => controller.abort(),
    );

    try {
        return await operation(controller.signal);
    } finally {
        cancellationDisposable.dispose();
    }
}

function formatEmulator(emulator: Emulator): string {
    return `${emulator.name} (${emulator.os}, ${emulator.id})`;
}

function formatAndroidLaunchProfile(options: AndroidLaunchOptions): string {
    const details: string[] = [];
    if (options.coldBoot) {
        details.push(vscode.l10n.t("Cold Boot"));
    }
    if (options.disableBootAnimation) {
        details.push(vscode.l10n.t("No boot animation"));
    }
    if (options.disableAudio) {
        details.push(vscode.l10n.t("No audio"));
    }
    if (options.gpuMode !== "default") {
        details.push(`GPU: ${options.gpuMode}`);
    }
    if (options.memoryMb) {
        details.push(vscode.l10n.t("{0} MB", options.memoryMb));
    }
    if (options.additionalArgs.length > 0) {
        details.push(
            vscode.l10n.t(
                "{0} additional arguments",
                options.additionalArgs.length,
            ),
        );
    }

    return details.length > 0
        ? details.join(" · ")
        : vscode.l10n.t("Default settings");
}

async function selectAndroidLaunchOptions(
    context: vscode.ExtensionContext,
    onSaveAsDefault: (options: AndroidLaunchOptions) => void,
): Promise<AndroidLaunchOptions | undefined> {
    const initialOptions = normalizeAndroidLaunchOptions(
        context.globalState.get<unknown>(ANDROID_LAUNCH_OPTIONS_KEY),
    );
    let profiles = getAndroidLaunchProfiles(
        context.globalState.get<unknown>(ANDROID_LAUNCH_PROFILES_KEY),
    );
    const panel = vscode.window.createWebviewPanel(
        "androidLaunchOptions",
        vscode.l10n.t("Android Launch Options"),
        vscode.ViewColumn.Active,
        { enableScripts: true },
    );

    panel.webview.html = getAndroidLaunchOptionsHtml(
        panel.webview,
        initialOptions,
        profiles,
    );

    return new Promise((resolve) => {
        let completed = false;
        const finish = (options?: AndroidLaunchOptions) => {
            if (completed) {
                return;
            }
            completed = true;
            resolve(options);
            panel.dispose();
        };

        panel.onDidDispose(() => finish());
        panel.webview.onDidReceiveMessage(async (message: unknown) => {
            if (typeof message !== "object" || message === null) {
                return;
            }

            const data = message as {
                type?: unknown;
                options?: unknown;
                saveAsDefault?: unknown;
                profileName?: unknown;
            };
            if (data.type === "cancel") {
                finish();
                return;
            }
            if (data.type !== "start") {
                const profileName = normalizeAndroidLaunchProfileName(
                    data.profileName,
                );
                if (data.type === "saveProfile" && profileName) {
                    const options = normalizeAndroidLaunchOptions(data.options);
                    profiles = [
                        ...profiles.filter(
                            (profile) =>
                                profile.name.toLocaleLowerCase() !==
                                profileName.toLocaleLowerCase(),
                        ),
                        { name: profileName, options },
                    ].sort((left, right) =>
                        left.name.localeCompare(right.name),
                    );
                    await context.globalState.update(
                        ANDROID_LAUNCH_PROFILES_KEY,
                        profiles,
                    );
                    await panel.webview.postMessage({
                        type: "profilesUpdated",
                        profiles,
                        selectedProfileName: profileName,
                    });
                } else if (data.type === "deleteProfile" && profileName) {
                    profiles = profiles.filter(
                        (profile) =>
                            profile.name.toLocaleLowerCase() !==
                            profileName.toLocaleLowerCase(),
                    );
                    await context.globalState.update(
                        ANDROID_LAUNCH_PROFILES_KEY,
                        profiles,
                    );
                    await panel.webview.postMessage({
                        type: "profilesUpdated",
                        profiles,
                    });
                }
                return;
            }

            const options = normalizeAndroidLaunchOptions(data.options);
            if (data.saveAsDefault === true) {
                await context.globalState.update(
                    ANDROID_LAUNCH_OPTIONS_KEY,
                    options,
                );
                onSaveAsDefault(options);
            }
            finish(options);
        });
    });
}

function getAndroidLaunchOptionsHtml(
    webview: vscode.Webview,
    options: AndroidLaunchOptions,
    profiles: AndroidLaunchProfile[],
): string {
    const nonce = randomBytes(16).toString("base64url");
    const labels = {
        title: vscode.l10n.t("Android Launch Options"),
        description: vscode.l10n.t(
            "Choose options for this start. Saved defaults apply to future starts.",
        ),
        coldBoot: vscode.l10n.t("Cold Boot (do not load snapshot)"),
        noBootAnimation: vscode.l10n.t("Disable boot animation"),
        noAudio: vscode.l10n.t("Disable audio"),
        gpuMode: vscode.l10n.t("GPU mode"),
        defaultGpu: vscode.l10n.t("Use AVD default"),
        memory: vscode.l10n.t("Memory (MB)"),
        memoryHint: vscode.l10n.t(
            "Leave empty to use the AVD setting (1536–8192).",
        ),
        additionalArgs: vscode.l10n.t("Additional arguments"),
        argsHint: vscode.l10n.t(
            "Enter one complete argument per line. They are appended after the selected options.",
        ),
        saveAsDefault: vscode.l10n.t("Save as default"),
        start: vscode.l10n.t("Start"),
        cancel: vscode.l10n.t("Cancel"),
        memoryError: vscode.l10n.t(
            "Memory must be an integer from 1536 to 8192.",
        ),
        profile: vscode.l10n.t("Launch profile"),
        savedDefault: vscode.l10n.t("Saved default"),
        profileName: vscode.l10n.t("Profile name"),
        saveProfile: vscode.l10n.t("Save profile"),
        deleteProfile: vscode.l10n.t("Delete profile"),
        profileNameRequired: vscode.l10n.t("Enter a profile name."),
    };
    const serializedOptions = JSON.stringify(options).replace(
        /</g,
        String.raw`\u003c`,
    );
    const serializedLabels = JSON.stringify(labels).replace(
        /</g,
        String.raw`\u003c`,
    );
    const serializedProfiles = JSON.stringify(profiles).replace(
        /</g,
        String.raw`\u003c`,
    );

    return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { color: var(--vscode-foreground); font-family: var(--vscode-font-family); margin: 20px; max-width: 640px; }
    h1 { font-size: 1.3em; margin: 0 0 8px; }
    p { color: var(--vscode-descriptionForeground); line-height: 1.5; }
    fieldset { border: 1px solid var(--vscode-editorWidget-border); margin: 20px 0; padding: 14px; }
    .field { display: grid; gap: 6px; margin: 14px 0; }
    label { display: flex; align-items: center; gap: 8px; }
    input, select, textarea { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); font: inherit; padding: 6px; }
    textarea { min-height: 92px; resize: vertical; }
    small { color: var(--vscode-descriptionForeground); }
    .profileActions { display: flex; gap: 8px; }
    .profileActions input { flex: 1; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; }
    button { background: var(--vscode-button-background); border: 0; color: var(--vscode-button-foreground); cursor: pointer; font: inherit; padding: 7px 14px; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  </style>
</head>
<body>
  <h1 id="title"></h1>
  <p id="description"></p>
  <form id="form">
    <fieldset>
      <label><input id="coldBoot" type="checkbox"> <span id="coldBootLabel"></span></label>
      <label><input id="disableBootAnimation" type="checkbox"> <span id="noBootAnimationLabel"></span></label>
      <label><input id="disableAudio" type="checkbox"> <span id="noAudioLabel"></span></label>
    </fieldset>
    <div class="field">
      <label for="profileSelect" id="profileLabel"></label>
      <select id="profileSelect"></select>
    </div>
    <div class="field">
      <label for="profileName" id="profileNameLabel"></label>
      <div class="profileActions"><input id="profileName" type="text" maxlength="64"><button type="button" id="saveProfile"></button><button class="secondary" type="button" id="deleteProfile"></button></div>
    </div>
    <div class="field">
      <label for="gpuMode" id="gpuModeLabel"></label>
      <select id="gpuMode"></select>
    </div>
    <div class="field">
      <label for="memoryMb" id="memoryLabel"></label>
      <input id="memoryMb" type="number" min="1536" max="8192" step="1" inputmode="numeric">
      <small id="memoryHint"></small>
    </div>
    <div class="field">
      <label for="additionalArgs" id="additionalArgsLabel"></label>
      <textarea id="additionalArgs" spellcheck="false"></textarea>
      <small id="argsHint"></small>
    </div>
    <label><input id="saveAsDefault" type="checkbox"> <span id="saveAsDefaultLabel"></span></label>
    <div class="actions">
      <button class="secondary" type="button" id="cancel"></button>
      <button type="submit" id="start"></button>
    </div>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const options = ${serializedOptions};
    const labels = ${serializedLabels};
    let profiles = ${serializedProfiles};
    const setText = (id, text) => document.getElementById(id).textContent = text;
    setText('title', labels.title); setText('description', labels.description);
    setText('coldBootLabel', labels.coldBoot); setText('noBootAnimationLabel', labels.noBootAnimation);
    setText('noAudioLabel', labels.noAudio); setText('gpuModeLabel', labels.gpuMode);
    setText('memoryLabel', labels.memory); setText('memoryHint', labels.memoryHint);
    setText('additionalArgsLabel', labels.additionalArgs); setText('argsHint', labels.argsHint);
    setText('saveAsDefaultLabel', labels.saveAsDefault); setText('cancel', labels.cancel); setText('start', labels.start);
    setText('profileLabel', labels.profile); setText('profileNameLabel', labels.profileName); setText('saveProfile', labels.saveProfile); setText('deleteProfile', labels.deleteProfile);
    const gpuMode = document.getElementById('gpuMode');
    const modes = ${JSON.stringify(ANDROID_GPU_MODES)};
    modes.forEach((mode) => { const option = document.createElement('option'); option.value = mode; option.textContent = mode === 'default' ? labels.defaultGpu : mode; gpuMode.append(option); });
    const applyOptions = (value) => { document.getElementById('coldBoot').checked = value.coldBoot; document.getElementById('disableBootAnimation').checked = value.disableBootAnimation; document.getElementById('disableAudio').checked = value.disableAudio; gpuMode.value = value.gpuMode; document.getElementById('memoryMb').value = value.memoryMb || ''; document.getElementById('additionalArgs').value = value.additionalArgs.join('\n'); };
    const readOptions = () => ({ coldBoot: document.getElementById('coldBoot').checked, disableBootAnimation: document.getElementById('disableBootAnimation').checked, disableAudio: document.getElementById('disableAudio').checked, gpuMode: gpuMode.value, memoryMb: document.getElementById('memoryMb').value === '' ? undefined : Number(document.getElementById('memoryMb').value), additionalArgs: document.getElementById('additionalArgs').value.split('\n').map((value) => value.trim()).filter(Boolean) });
    const profileSelect = document.getElementById('profileSelect');
    const updateProfiles = (selectedProfileName) => { profileSelect.textContent = ''; const defaultOption = document.createElement('option'); defaultOption.value = ''; defaultOption.textContent = labels.savedDefault; profileSelect.append(defaultOption); profiles.forEach((profile) => { const option = document.createElement('option'); option.value = profile.name; option.textContent = profile.name; profileSelect.append(option); }); profileSelect.value = selectedProfileName || ''; document.getElementById('deleteProfile').disabled = !selectedProfileName; };
    updateProfiles(); applyOptions(options);
    profileSelect.addEventListener('change', () => { const profile = profiles.find((item) => item.name === profileSelect.value); document.getElementById('profileName').value = profile ? profile.name : ''; document.getElementById('deleteProfile').disabled = !profile; if (profile) applyOptions(profile.options); });
    document.getElementById('saveProfile').addEventListener('click', () => { const profileName = document.getElementById('profileName').value.trim(); if (!profileName) { document.getElementById('profileName').setCustomValidity(labels.profileNameRequired); document.getElementById('profileName').reportValidity(); return; } document.getElementById('profileName').setCustomValidity(''); vscode.postMessage({ type: 'saveProfile', profileName, options: readOptions() }); });
    document.getElementById('deleteProfile').addEventListener('click', () => { if (profileSelect.value) vscode.postMessage({ type: 'deleteProfile', profileName: profileSelect.value }); });
    window.addEventListener('message', (event) => { const message = event.data; if (message.type === 'profilesUpdated') { profiles = message.profiles; updateProfiles(message.selectedProfileName); if (message.selectedProfileName) document.getElementById('profileName').value = message.selectedProfileName; } });
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    document.getElementById('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const memoryInput = document.getElementById('memoryMb');
      const memoryMb = memoryInput.value === '' ? undefined : Number(memoryInput.value);
      if (memoryMb !== undefined && (!Number.isInteger(memoryMb) || memoryMb < 1536 || memoryMb > 8192)) {
        memoryInput.setCustomValidity(labels.memoryError); memoryInput.reportValidity(); return;
      }
      memoryInput.setCustomValidity('');
      vscode.postMessage({ type: 'start', saveAsDefault: document.getElementById('saveAsDefault').checked, options: readOptions() });
    });
  </script>
</body>
</html>`;
}

async function selectEmulatorByState(
    emulatorService: EmulatorService,
    state: EmulatorState,
    actionLabel: string,
    outputChannel: vscode.OutputChannel,
    os?: Emulator["os"],
): Promise<Emulator | undefined> {
    logOutput(outputChannel, `Loading devices to ${actionLabel}.`);
    let emulators: Emulator[];
    try {
        emulators = await emulatorService.getEmulators();
    } catch (error: unknown) {
        reportError(
            outputChannel,
            vscode.l10n.t("Failed to load devices"),
            error,
        );
        return undefined;
    }

    const stateLabel = getStateLabel(state);
    const stateEmulators = emulators.filter(
        (emulator) => emulator.state === state,
    );
    if (stateEmulators.length === 0) {
        logOutput(outputChannel, `No ${state} devices are available.`);
        showInformationMessage(
            vscode.l10n.t("No {0} devices are available.", stateLabel),
        );
        return undefined;
    }

    const selectedOs = os
        ? { label: os }
        : await vscode.window.showQuickPick(
              ["Android", "iOS"].map((platform) => ({
                  label: platform as Emulator["os"],
                  description: vscode.l10n.t(
                      "{0} {1}",
                      stateEmulators.filter(
                          (emulator) => emulator.os === platform,
                      ).length,
                      stateLabel,
                  ),
              })),
              {
                  placeHolder: vscode.l10n.t("Select a platform"),
              },
          );

    if (!selectedOs) {
        return undefined;
    }

    const platformEmulators = stateEmulators.filter(
        (emulator) => emulator.os === selectedOs.label,
    );
    if (platformEmulators.length === 0) {
        logOutput(
            outputChannel,
            `No ${state} ${selectedOs.label} devices are available.`,
        );
        showInformationMessage(
            vscode.l10n.t(
                "No {0} {1} devices are available.",
                stateLabel,
                selectedOs.label,
            ),
        );
        return undefined;
    }

    const selected = await vscode.window.showQuickPick(
        platformEmulators.map((emulator) => ({
            label: emulator.name,
            description: emulator.osVersion || emulator.os,
            detail: `${emulator.os} • ${emulator.id}`,
            emulator,
        })),
        {
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: vscode.l10n.t(
                "Select a {0} device to {1}",
                selectedOs.label,
                actionLabel,
            ),
        },
    );

    return selected?.emulator;
}

function getStateLabel(state: EmulatorState): string {
    return state === "running"
        ? vscode.l10n.t("running")
        : vscode.l10n.t("stopped");
}

function getLastAppPath(
    context: vscode.ExtensionContext,
    os: "iOS" | "Android",
): string | undefined {
    return context.globalState.get<string>(getLastAppPathKey(os));
}

async function saveLastAppPath(
    context: vscode.ExtensionContext,
    os: "iOS" | "Android",
    appPath: string,
): Promise<void> {
    await context.globalState.update(getLastAppPathKey(os), appPath);
}

function getLastAppPathKey(os: "iOS" | "Android"): string {
    return os === "Android" ? LAST_ANDROID_APP_PATH_KEY : LAST_IOS_APP_PATH_KEY;
}

function getAppFileExtension(os: "iOS" | "Android"): string {
    return os === "Android" ? ".apk" : ".ipa";
}

function getFileName(filePath: string): string {
    return filePath.split(/[\\/]/).pop() || filePath;
}

async function startEmulatorWithProgress(
    emulator: Emulator,
    emulatorService: EmulatorService,
    treeDataProvider: EmulatorTreeDataProvider,
    outputChannel: vscode.OutputChannel,
    launchOptions: Partial<AndroidLaunchOptions> = {},
): Promise<void> {
    const coldBoot = launchOptions.coldBoot === true;
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: coldBoot
                ? vscode.l10n.t("Cold booting {0}...", emulator.name)
                : vscode.l10n.t("Starting {0}...", emulator.name),
            cancellable: true,
        },
        async (_progress, cancellationToken) => {
            await withCancellation(cancellationToken, async (signal) => {
                logOutput(
                    outputChannel,
                    `${coldBoot ? "Cold booting" : "Starting"} ${formatEmulator(emulator)}.`,
                );
                try {
                    await emulatorService.startEmulator(
                        emulator,
                        signal,
                        launchOptions,
                    );
                    logOutput(
                        outputChannel,
                        `${coldBoot ? "Cold booted" : "Started"} ${formatEmulator(emulator)} successfully.`,
                    );
                    showInformationMessage(
                        coldBoot
                            ? vscode.l10n.t(
                                  "Cold booted {0} successfully.",
                                  emulator.name,
                              )
                            : vscode.l10n.t(
                                  "Started {0} successfully.",
                                  emulator.name,
                              ),
                    );
                    treeDataProvider.refresh();
                } catch (error: unknown) {
                    reportError(
                        outputChannel,
                        coldBoot
                            ? vscode.l10n.t(
                                  "Failed to cold boot {0}",
                                  emulator.name,
                              )
                            : vscode.l10n.t(
                                  "Failed to start {0}",
                                  emulator.name,
                              ),
                        error,
                    );
                }
            });
        },
    );
}

async function startAndInstallAppWithProgress(
    emulator: Emulator,
    appPath: string,
    emulatorService: EmulatorService,
    treeDataProvider: EmulatorTreeDataProvider,
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t(
                "Starting {0} and installing {1}...",
                emulator.name,
                getFileName(appPath),
            ),
            cancellable: true,
        },
        async (_progress, cancellationToken) => {
            await withCancellation(cancellationToken, async (signal) => {
                logOutput(
                    outputChannel,
                    `Starting ${formatEmulator(emulator)} and installing ${appPath}.`,
                );
                try {
                    await emulatorService.startEmulator(emulator, signal);
                    await emulatorService.installApp(emulator, appPath, signal);
                    await saveLastAppPath(context, emulator.os, appPath);
                    logOutput(
                        outputChannel,
                        `Started ${formatEmulator(emulator)} and installed ${appPath} successfully.`,
                    );
                    showInformationMessage(
                        vscode.l10n.t(
                            "Started {0} and installed app successfully.",
                            emulator.name,
                        ),
                    );
                    treeDataProvider.refresh();
                } catch (error: unknown) {
                    reportError(
                        outputChannel,
                        vscode.l10n.t(
                            "Failed to start and install app to {0}",
                            emulator.name,
                        ),
                        error,
                    );
                }
            });
        },
    );
}

async function installLastAppWithProgress(
    emulator: Emulator,
    emulatorService: EmulatorService,
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
): Promise<void> {
    const appPath = getLastAppPath(context, emulator.os);
    if (!appPath) {
        logOutput(
            outputChannel,
            `No recent ${getAppFileExtension(emulator.os)} file found for ${emulator.os}.`,
        );
        showInformationMessage(
            vscode.l10n.t(
                "No recent {0} file found for {1}. Use Install App... first.",
                getAppFileExtension(emulator.os),
                emulator.os,
            ),
        );
        return;
    }

    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(appPath));
    } catch {
        logOutput(
            outputChannel,
            `Last ${emulator.os} app file no longer exists: ${appPath}`,
        );
        showWarningMessage(
            vscode.l10n.t(
                "The last {0} app file no longer exists: {1}",
                emulator.os,
                appPath,
            ),
        );
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t(
                "Installing {0} to {1}...",
                getFileName(appPath),
                emulator.name,
            ),
            cancellable: true,
        },
        async (_progress, cancellationToken) => {
            await withCancellation(cancellationToken, async (signal) => {
                logOutput(
                    outputChannel,
                    `Installing last app ${appPath} to ${formatEmulator(emulator)}.`,
                );
                try {
                    await emulatorService.installApp(emulator, appPath, signal);
                    logOutput(
                        outputChannel,
                        `Installed last app ${appPath} to ${formatEmulator(emulator)} successfully.`,
                    );
                    showInformationMessage(
                        vscode.l10n.t(
                            "Installed {0} to {1} successfully.",
                            getFileName(appPath),
                            emulator.name,
                        ),
                    );
                } catch (error: unknown) {
                    reportError(
                        outputChannel,
                        vscode.l10n.t(
                            "Failed to install last app to {0}",
                            emulator.name,
                        ),
                        error,
                    );
                }
            });
        },
    );
}

async function selectAppFile(
    os: "iOS" | "Android",
): Promise<vscode.Uri | undefined> {
    const fileSelection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: vscode.l10n.t("Install"),
        filters:
            os === "Android"
                ? { [vscode.l10n.t("Android APK")]: ["apk"] }
                : { [vscode.l10n.t("iOS IPA")]: ["ipa"] },
    });

    return fileSelection?.[0];
}

function getGuidedErrorMessage(prefix: string, error: unknown): string {
    const details = getErrorDetails(error);
    const guide = getCauseGuide(details);
    return guide ? `${prefix}: ${details} ${guide}` : `${prefix}: ${details}`;
}

function reportError(
    outputChannel: vscode.OutputChannel,
    prefix: string,
    error: unknown,
): void {
    if (getErrorDetails(error) === "Operation cancelled.") {
        logOutput(outputChannel, `${prefix}: Operation cancelled.`);
        showInformationMessage(vscode.l10n.t("Operation cancelled."));
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

    if (typeof error === "string" && error.trim()) {
        return error.trim();
    }

    return vscode.l10n.t("Unknown error.");
}

function getCauseGuide(details: string): string | undefined {
    const normalized = details.toLowerCase();

    if (
        matchesAny(normalized, [
            "adb: command not found",
            "adb: not found",
            "enoent",
        ]) &&
        normalized.includes("adb")
    ) {
        return vscode.l10n.t(
            "Guide: ADB was not found. Install Android SDK Platform-Tools, then set mobileEmulatorManager.androidSdkPath, ANDROID_SDK_ROOT, ANDROID_HOME, or add adb to PATH.",
        );
    }

    if (
        normalized.includes("/emulator/emulator") &&
        matchesAny(normalized, ["no such file", "not found", "enoent"])
    ) {
        return vscode.l10n.t(
            "Guide: The Android emulator command was not found. Install Android Emulator in Android Studio and make sure mobileEmulatorManager.androidSdkPath, ANDROID_SDK_ROOT, or ANDROID_HOME points to your SDK.",
        );
    }

    if (
        normalized.includes("xcrun") &&
        matchesAny(normalized, [
            "unable to find utility",
            "not found",
            "xcode-select",
        ])
    ) {
        return vscode.l10n.t(
            "Guide: Xcode command line tools were not found. Install Xcode and check mobileEmulatorManager.xcodeDeveloperPath or your xcode-select configuration.",
        );
    }

    if (normalized.includes("unable to boot device")) {
        return vscode.l10n.t(
            "Guide: The iOS Simulator could not boot. Check that the device is available in Xcode Devices and Simulators.",
        );
    }

    if (
        normalized.includes("is not running") ||
        normalized.includes("could not be found")
    ) {
        return vscode.l10n.t(
            "Guide: Check that the target emulator is running, then refresh the device list and try again.",
        );
    }

    if (normalized.includes("please select an .apk file")) {
        return vscode.l10n.t("Guide: Select an .apk file for Android.");
    }

    if (normalized.includes("please select an .ipa file")) {
        return vscode.l10n.t("Guide: Select an .ipa file for iOS Simulator.");
    }

    if (
        normalized.includes("does not contain a payload directory") ||
        normalized.includes("does not contain an app bundle")
    ) {
        return vscode.l10n.t(
            "Guide: The selected .ipa does not contain a Simulator-installable .app. Choose an app built for iOS Simulator.",
        );
    }

    if (
        normalized.includes("install_failed") ||
        normalized.includes("failure [")
    ) {
        return vscode.l10n.t(
            "Guide: APK installation failed. Check signing, minSdk, existing app signature mismatch, and device storage.",
        );
    }

    if (
        normalized.includes("failed to install") &&
        normalized.includes("simctl")
    ) {
        return vscode.l10n.t(
            "Guide: iOS Simulator installation failed. Make sure this is a Simulator build, not a device-only IPA.",
        );
    }

    return undefined;
}

function matchesAny(value: string, needles: string[]): boolean {
    return needles.some((needle) => value.includes(needle));
}
