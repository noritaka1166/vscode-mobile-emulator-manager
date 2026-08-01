import * as path from "node:path";

export function getDefaultAndroidSdkPaths(
    platform: NodeJS.Platform,
    homeDirectory: string,
    localAppData?: string,
): string[] {
    switch (platform) {
        case "win32":
            return [
                ...(localAppData
                    ? [path.join(localAppData, "Android", "Sdk")]
                    : []),
                path.join(homeDirectory, "AppData", "Local", "Android", "Sdk"),
            ];
        case "linux":
            return [
                path.join(homeDirectory, "Android", "Sdk"),
                path.join(homeDirectory, "Android", "sdk"),
            ];
        default:
            return [path.join(homeDirectory, "Library", "Android", "sdk")];
    }
}

export function getAndroidToolPath(
    sdkPath: string,
    directory: string,
    toolName: string,
    platform: NodeJS.Platform,
): string {
    const executableName = platform === "win32" ? `${toolName}.exe` : toolName;
    return path.join(sdkPath, directory, executableName);
}
