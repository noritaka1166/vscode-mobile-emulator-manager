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
                vscode.window.showInformationMessage(`Starting ${node.emulator.name}...`);
                try {
                    await emulatorService.startEmulator(node.emulator);
                    vscode.window.showInformationMessage(`Started ${node.emulator.name} successfully.`);
                    treeDataProvider.refresh();
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to start ${node.emulator.name}: ${e.message}`);
                }
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
        vscode.commands.registerCommand('emulators.copyId', async (node: EmulatorTreeItem) => {
            if (node?.emulator) {
                await vscode.env.clipboard.writeText(node.emulator.id);
                vscode.window.showInformationMessage(`Copied UDID: ${node.emulator.id}`);
            }
        })
    );
}

export function deactivate() {}
