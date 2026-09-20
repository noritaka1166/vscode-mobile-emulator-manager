import * as path from "node:path";

export const ANDROID_GPU_MODES = [
    "default",
    "auto",
    "host",
    "software",
    "lavapipe",
    "swiftshader",
    "swangle",
] as const;

export type AndroidGpuMode = (typeof ANDROID_GPU_MODES)[number];

export interface AndroidLaunchOptions {
    coldBoot: boolean;
    disableBootAnimation: boolean;
    disableAudio: boolean;
    gpuMode: AndroidGpuMode;
    memoryMb?: number;
    additionalArgs: string[];
}

export interface AndroidLaunchProfile {
    name: string;
    options: AndroidLaunchOptions;
}

export const DEFAULT_ANDROID_LAUNCH_OPTIONS: AndroidLaunchOptions = {
    coldBoot: false,
    disableBootAnimation: false,
    disableAudio: false,
    gpuMode: "default",
    additionalArgs: [],
};

export function normalizeAndroidLaunchOptions(
    value: unknown,
): AndroidLaunchOptions {
    const options =
        typeof value === "object" && value !== null
            ? (value as Partial<AndroidLaunchOptions>)
            : {};
    const memoryMb = options.memoryMb;

    return {
        coldBoot: options.coldBoot === true,
        disableBootAnimation: options.disableBootAnimation === true,
        disableAudio: options.disableAudio === true,
        gpuMode: ANDROID_GPU_MODES.includes(options.gpuMode as AndroidGpuMode)
            ? (options.gpuMode as AndroidGpuMode)
            : "default",
        memoryMb:
            typeof memoryMb === "number" &&
            Number.isInteger(memoryMb) &&
            memoryMb >= 1536 &&
            memoryMb <= 8192
                ? memoryMb
                : undefined,
        additionalArgs: Array.isArray(options.additionalArgs)
            ? options.additionalArgs
                  .filter((arg): arg is string => typeof arg === "string")
                  .map((arg) => arg.trim())
                  .filter((arg) => arg.length > 0 && arg !== "-avd")
            : [],
    };
}

export function normalizeAndroidLaunchProfileName(
    value: unknown,
): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const name = value.trim();
    return name.length > 0 && name.length <= 64 ? name : undefined;
}

export function getAndroidLaunchProfiles(
    value: unknown,
): AndroidLaunchProfile[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const profiles = new Map<string, AndroidLaunchProfile>();
    for (const valueItem of value) {
        if (typeof valueItem !== "object" || valueItem === null) {
            continue;
        }

        const item = valueItem as { name?: unknown; options?: unknown };
        const name = normalizeAndroidLaunchProfileName(item.name);
        if (name) {
            profiles.set(name.toLocaleLowerCase(), {
                name,
                options: normalizeAndroidLaunchOptions(item.options),
            });
        }
    }

    return Array.from(profiles.values()).sort((left, right) =>
        left.name.localeCompare(right.name),
    );
}

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

export function getAndroidEmulatorStartArgs(
    avdName: string,
    launchOptions: Partial<AndroidLaunchOptions> = {},
): string[] {
    const options = normalizeAndroidLaunchOptions(launchOptions);
    const args = ["-avd", avdName];

    if (options.coldBoot) {
        args.push("-no-snapshot-load");
    }
    if (options.disableBootAnimation) {
        args.push("-no-boot-anim");
    }
    if (options.disableAudio) {
        args.push("-no-audio");
    }
    if (options.gpuMode !== "default") {
        args.push("-gpu", options.gpuMode);
    }
    if (options.memoryMb) {
        args.push("-memory", String(options.memoryMb));
    }

    return [...args, ...options.additionalArgs];
}
