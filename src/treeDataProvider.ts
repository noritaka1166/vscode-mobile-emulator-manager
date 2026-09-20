import * as vscode from "vscode";
import type { Emulator, EmulatorService } from "./emulatorService";
import { getFavoriteEmulatorKey } from "./favorites";

type TreeDataChange = EmulatorTreeItem | undefined | null;

export class EmulatorTreeDataProvider
    implements vscode.TreeDataProvider<EmulatorTreeItem>
{
    private readonly _onDidChangeTreeData: vscode.EventEmitter<TreeDataChange> =
        new vscode.EventEmitter<TreeDataChange>();
    readonly onDidChangeTreeData: vscode.Event<TreeDataChange> =
        this._onDidChangeTreeData.event;

    constructor(
        private readonly emulatorService: EmulatorService,
        private favoriteEmulatorKeys: ReadonlySet<string> = new Set(),
    ) {}

    setFavoriteEmulatorKeys(keys: ReadonlySet<string>): void {
        this.favoriteEmulatorKeys = new Set(keys);
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: EmulatorTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: EmulatorTreeItem): Promise<EmulatorTreeItem[]> {
        if (!element) {
            const emulators = await this.emulatorService.getEmulators();
            const favorites = emulators.filter((emulator) =>
                this.favoriteEmulatorKeys.has(getFavoriteEmulatorKey(emulator)),
            );
            const roots: EmulatorTreeItem[] = [];
            if (favorites.length > 0) {
                roots.push(
                    new EmulatorTreeItem(
                        vscode.l10n.t("Favorites"),
                        vscode.TreeItemCollapsibleState.Expanded,
                        "favorites",
                    ),
                );
            }

            roots.push(
                new EmulatorTreeItem(
                    "iOS",
                    vscode.TreeItemCollapsibleState.Expanded,
                    "platform",
                    undefined,
                    "iOS",
                ),
                new EmulatorTreeItem(
                    "Android",
                    vscode.TreeItemCollapsibleState.Expanded,
                    "platform",
                    undefined,
                    "Android",
                ),
            );
            return roots;
        } else if (element.type === "favorites") {
            const emulators = await this.emulatorService.getEmulators();
            return emulators
                .filter((emulator) =>
                    this.favoriteEmulatorKeys.has(
                        getFavoriteEmulatorKey(emulator),
                    ),
                )
                .sort(
                    (left, right) =>
                        left.os.localeCompare(right.os) ||
                        left.name.localeCompare(right.name),
                )
                .map(
                    (emulator) =>
                        new EmulatorTreeItem(
                            emulator.name,
                            vscode.TreeItemCollapsibleState.None,
                            "emulator",
                            emulator,
                            emulator.os,
                            true,
                        ),
                );
        } else if (element.type === "platform") {
            // OS Version nodes
            const emulators = await this.emulatorService.getEmulators();
            const platformEmulators = emulators.filter(
                (e) => e.os === element.os,
            );

            const versions = new Set(
                platformEmulators.map(
                    (emulator) => emulator.osVersion || "Unknown",
                ),
            );

            return Array.from(versions)
                .sort((a, b) => b.localeCompare(a)) // Sort versions descending
                .map(
                    (v) =>
                        new EmulatorTreeItem(
                            v,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            "osVersion",
                            undefined,
                            element.os,
                        ),
                );
        } else if (element.type === "osVersion") {
            // Emulator nodes
            const emulators = await this.emulatorService.getEmulators();
            return emulators
                .filter(
                    (e) =>
                        e.os === element.os &&
                        (e.osVersion || "Unknown") === element.label,
                )
                .map(
                    (e) =>
                        new EmulatorTreeItem(
                            e.name,
                            vscode.TreeItemCollapsibleState.None,
                            "emulator",
                            e,
                            element.os,
                            this.favoriteEmulatorKeys.has(
                                getFavoriteEmulatorKey(e),
                            ),
                        ),
                );
        }
        return [];
    }
}

export class EmulatorTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type:
            | "favorites"
            | "platform"
            | "osVersion"
            | "emulator",
        public readonly emulator?: Emulator,
        public readonly os?: "iOS" | "Android",
        favorite = false,
    ) {
        super(label, collapsibleState);

        if (type === "emulator" && emulator) {
            this.contextValue = `emulator-${emulator.os.toLowerCase()}-${favorite ? "favorite" : "regular"}-${emulator.state}`;

            let desc = emulator.osVersion
                ? `${emulator.osVersion} (${emulator.state})`
                : emulator.state;
            if (emulator.os === "iOS") {
                desc += ` [${emulator.id}]`;
            }
            this.description = favorite ? `★ ${desc}` : desc;

            if (emulator.state === "running") {
                this.iconPath = new vscode.ThemeIcon(
                    "circle-filled",
                    new vscode.ThemeColor("testing.iconPassed"),
                );
            } else {
                this.iconPath = new vscode.ThemeIcon(
                    "circle-large-outline",
                    new vscode.ThemeColor("disabledForeground"),
                );
            }
        } else if (type === "osVersion") {
            this.iconPath = new vscode.ThemeIcon("versions");
            this.contextValue = "osVersion";
        } else if (type === "favorites") {
            this.iconPath = new vscode.ThemeIcon("star-full");
            this.contextValue = "favorites";
        } else {
            this.iconPath = new vscode.ThemeIcon("folder");
            this.contextValue = "platform";
        }
    }
}
