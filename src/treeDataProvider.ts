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
        if (!element) {
            // Root nodes: iOS and Android
            return [
                new EmulatorTreeItem('iOS', vscode.TreeItemCollapsibleState.Expanded, 'platform', undefined, 'iOS'),
                new EmulatorTreeItem('Android', vscode.TreeItemCollapsibleState.Expanded, 'platform', undefined, 'Android')
            ];
        } else if (element.type === 'platform') {
            // OS Version nodes
            const emulators = await this.emulatorService.getEmulators();
            const platformEmulators = emulators.filter(e => e.os === element.os);
            
            const versions = new Set<string>();
            platformEmulators.forEach(e => versions.add(e.osVersion || 'Unknown'));
            
            return Array.from(versions)
                .sort((a, b) => b.localeCompare(a)) // Sort versions descending
                .map(v => new EmulatorTreeItem(v, vscode.TreeItemCollapsibleState.Collapsed, 'osVersion', undefined, element.os));
        } else if (element.type === 'osVersion') {
            // Emulator nodes
            const emulators = await this.emulatorService.getEmulators();
            return emulators
                .filter(e => e.os === element.os && (e.osVersion || 'Unknown') === element.label)
                .map(e => new EmulatorTreeItem(e.name, vscode.TreeItemCollapsibleState.None, 'emulator', e, element.os));
        }
        return [];
    }
}

export class EmulatorTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'platform' | 'osVersion' | 'emulator',
        public readonly emulator?: Emulator,
        public readonly os?: 'iOS' | 'Android'
    ) {
        super(label, collapsibleState);
        
        if (type === 'emulator' && emulator) {
            this.contextValue = `emulator-${emulator.os.toLowerCase()}-${emulator.state}`;
            
            let desc = emulator.osVersion ? `${emulator.osVersion} (${emulator.state})` : emulator.state;
            if (emulator.os === 'iOS') {
                desc += ` [${emulator.id}]`;
            }
            this.description = desc;
            
            if (emulator.state === 'running') {
                this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('testing.iconPassed'));
            } else {
                this.iconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('testing.iconFailed'));
            }
        } else if (type === 'osVersion') {
            this.iconPath = new vscode.ThemeIcon('versions');
            this.contextValue = 'osVersion';
        } else {
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'platform';
        }
    }
}
