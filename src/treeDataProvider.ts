import * as vscode from 'vscode';
import { Emulator, EmulatorService } from './emulatorService';

export class EmulatorTreeDataProvider implements vscode.TreeDataProvider<EmulatorTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<EmulatorTreeItem | undefined | null | void> = new vscode.EventEmitter<EmulatorTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<EmulatorTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private emulatorService: EmulatorService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: EmulatorTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: EmulatorTreeItem): Promise<EmulatorTreeItem[]> {
        if (element) {
            // Category node
            const emulators = await this.emulatorService.getEmulators();
            return emulators
                .filter(e => e.os === element.label)
                .map(e => new EmulatorTreeItem(e.name, vscode.TreeItemCollapsibleState.None, e));
        } else {
            // Root nodes: iOS and Android
            return [
                new EmulatorTreeItem('iOS', vscode.TreeItemCollapsibleState.Expanded),
                new EmulatorTreeItem('Android', vscode.TreeItemCollapsibleState.Expanded)
            ];
        }
    }
}

export class EmulatorTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly emulator?: Emulator
    ) {
        super(label, collapsibleState);
        
        if (emulator) {
            this.contextValue = `emulator-${emulator.state}`;
            this.description = emulator.state;
            if (emulator.state === 'running') {
                this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('testing.iconPassed'));
            } else {
                this.iconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('testing.iconFailed'));
            }
        } else {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}
