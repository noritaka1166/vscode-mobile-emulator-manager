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
                        vscode.window.showErrorMessage(`Failed to start ${emulator.name}: ${e.message}`);
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
                    vscode.window.showErrorMessage(`Failed to stop ${node.emulator.name}: ${e.message}`);
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
                    vscode.window.showErrorMessage(`Failed to install app to ${emulator.name}: ${e.message}`);
                }
            });
        }),
        vscode.commands.registerCommand('emulators.copyId', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                await vscode.env.clipboard.writeText(node.emulator.id);
                vscode.window.showInformationMessage(`Copied UDID: ${node.emulator.id}`);
            }
        })
    );
}

export function deactivate() {}
