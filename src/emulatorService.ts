import { execFile, spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

const ANDROID_OS_VERSION_BY_API: Record<string, string> = {
    '36': 'Android 16',
    '35': 'Android 15',
    '34': 'Android 14',
    '33': 'Android 13',
    '32': 'Android 12L',
    '31': 'Android 12',
    '30': 'Android 11',
    '29': 'Android 10',
    '28': 'Android 9',
    '27': 'Android 8.1',
    '26': 'Android 8.0',
    '25': 'Android 7.1',
    '24': 'Android 7.0',
    '23': 'Android 6.0',
    '22': 'Android 5.1',
    '21': 'Android 5.0'
};

const SIM_RUNTIME_VERSION_PATTERN = /SimRuntime\.(.+?)-(\d+)-(\d+)/;
const SIM_RUNTIME_FALLBACK_PATTERN = /SimRuntime\.(.+)$/;
const ANDROID_DEVICE_DETECTION_TIMEOUT_MS = 60_000;
const ANDROID_BOOT_COMPLETION_TIMEOUT_MS = 120_000;
const IOS_BOOT_COMPLETION_TIMEOUT_MS = 120_000;
const APP_INSTALL_TIMEOUT_MS = 120_000;
const COMMAND_TIMEOUT_MS = 30_000;
const STARTUP_POLL_INTERVAL_MS = 2_000;

export interface Emulator {
    id: string; // uuid for iOS, name for Android
    name: string;
    os: 'iOS' | 'Android';
    osVersion?: string;
    state: 'running' | 'stopped';
}

interface SimctlDevice {
    name: string;
    state: string;
    udid: string;
}

interface SimctlListDevicesResult {
    devices: Record<string, SimctlDevice[]>;
}

interface RunningAndroidDevice {
    avdName: string;
    serial: string;
}

interface CommandOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

export class EmulatorService {
    constructor(private readonly log?: (message: string) => void) {}

    private getAdbCommand(): string {
        const configuredOrEnvSdkPath = this.getConfiguredOrEnvironmentAndroidSdkPath();
        if (configuredOrEnvSdkPath) {
            return this.getAndroidToolPath(configuredOrEnvSdkPath, 'platform-tools', 'adb');
        }

        const defaultAdbCommand = this.getAndroidToolPath(this.getAndroidSdkPath(), 'platform-tools', 'adb');
        return fs.existsSync(defaultAdbCommand) ? defaultAdbCommand : 'adb';
    }

    private getAndroidSdkPath(): string {
        const configuredOrEnvSdkPath = this.getConfiguredOrEnvironmentAndroidSdkPath();
        if (configuredOrEnvSdkPath) {
            return configuredOrEnvSdkPath;
        }

        const defaultSdkPaths = this.getDefaultAndroidSdkPaths();
        return defaultSdkPaths.find(sdkPath => fs.existsSync(sdkPath)) || defaultSdkPaths[0];
    }

    private getConfiguredAndroidSdkPath(): string | undefined {
        const configuredPath = vscode.workspace
            .getConfiguration('mobileEmulatorManager')
            .get<string>('androidSdkPath')
            ?.trim();

        return configuredPath ? this.expandHome(configuredPath) : undefined;
    }

    private getConfiguredOrEnvironmentAndroidSdkPath(): string | undefined {
        const configuredSdkPath = this.getConfiguredAndroidSdkPath();
        if (configuredSdkPath) {
            return configuredSdkPath;
        }

        const androidSdkRoot = process.env.ANDROID_SDK_ROOT?.trim();
        if (androidSdkRoot) {
            return this.expandHome(androidSdkRoot);
        }

        const androidHome = process.env.ANDROID_HOME?.trim();
        return androidHome ? this.expandHome(androidHome) : undefined;
    }

    private getDefaultAndroidSdkPaths(): string[] {
        const home = os.homedir();

        switch (process.platform) {
            case 'win32':
                return [
                    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
                    path.join(home, 'AppData', 'Local', 'Android', 'Sdk')
                ].filter(Boolean);
            case 'linux':
                return [
                    path.join(home, 'Android', 'Sdk'),
                    path.join(home, 'Android', 'sdk')
                ];
            default:
                return [path.join(home, 'Library', 'Android', 'sdk')];
        }
    }

    private getAndroidToolPath(sdkPath: string, directory: string, toolName: string): string {
        const executableName = process.platform === 'win32' ? `${toolName}.exe` : toolName;
        return path.join(sdkPath, directory, executableName);
    }

    private expandHome(filePath: string): string {
        if (filePath === '~') {
            return os.homedir();
        }

        if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
            return path.join(os.homedir(), filePath.slice(2));
        }

        return filePath;
    }

    private getAndroidOsVersion(apiLevel: string): string {
        const version = ANDROID_OS_VERSION_BY_API[apiLevel];
        return version ? `${version} (API ${apiLevel})` : `API ${apiLevel}`;
    }

    private getAndroidAvdConfigContent(avdName: string): string | undefined {
        const avdRoot = path.join(os.homedir(), '.android', 'avd');
        const metadataPath = path.join(avdRoot, `${avdName}.ini`);
        let metadata: string | undefined;

        if (fs.existsSync(metadataPath)) {
            metadata = fs.readFileSync(metadataPath, 'utf-8');
            const absoluteAvdPath = this.getIniValue(metadata, 'path');
            const relativeAvdPath = this.getIniValue(metadata, 'path.rel');
            const avdPath = absoluteAvdPath || relativeAvdPath;
            if (avdPath) {
                const resolvedAvdPath = path.isAbsolute(avdPath) ? avdPath : path.join(os.homedir(), '.android', avdPath);
                const configPath = path.join(resolvedAvdPath, 'config.ini');
                if (fs.existsSync(configPath)) {
                    return `${metadata}\n${fs.readFileSync(configPath, 'utf-8')}`;
                }
            }
        }

        const directConfigPath = path.join(avdRoot, `${avdName}.avd`, 'config.ini');
        if (fs.existsSync(directConfigPath)) {
            return fs.readFileSync(directConfigPath, 'utf-8');
        }

        return metadata;
    }

    private getIniValue(content: string, key: string): string | undefined {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
        const match = new RegExp(String.raw`^${escapedKey}\s*=\s*(.+)$`, 'm').exec(content);
        return match?.[1].trim();
    }

    private getAndroidOsVersionFromConfig(content: string): string {
        const candidates = [
            this.getIniValue(content, 'target'),
            this.getIniValue(content, 'image.sysdir.1')
        ].filter((value): value is string => !!value);

        for (const candidate of candidates) {
            const apiMatch = /(?:android-|:)(\d+)(?:[/:\s]|$)/.exec(candidate);
            if (apiMatch) {
                return this.getAndroidOsVersion(apiMatch[1]);
            }
        }

        return 'Unknown';
    }

    public async getEmulators(): Promise<Emulator[]> {
        const [iosEmulators, androidEmulators] = await Promise.all([
            this.getIosEmulators(),
            this.getAndroidEmulators()
        ]);
        return [...iosEmulators, ...androidEmulators];
    }

    private executeFile(command: string, args: string[], options: CommandOptions = {}): Promise<string> {
        this.log?.(`$ ${[command, ...args].map(arg => this.formatCommandArg(arg)).join(' ')}`);
        return new Promise((resolve, reject) => {
            execFile(command, args, {
                signal: options.signal,
                timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS
            }, (error, stdout, stderr) => {
                if (error) {
                    const commandError = error as NodeJS.ErrnoException & { killed?: boolean };
                    const message = options.signal?.aborted || commandError.code === 'ABORT_ERR'
                        ? 'Operation cancelled.'
                        : commandError.killed
                            ? `Command timed out after ${options.timeoutMs ?? COMMAND_TIMEOUT_MS} ms.`
                            : stderr.trim() || error.message;
                    this.log?.(`Command failed: ${message}`);
                    reject(new Error(message));
                } else {
                    this.logOutput(stdout);
                    resolve(stdout);
                }
            });
        });
    }

    private spawnDetached(command: string, args: string[]): Promise<void> {
        this.log?.(`$ ${[command, ...args].map(arg => this.formatCommandArg(arg)).join(' ')}`);
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                detached: true,
                stdio: 'ignore'
            });

            child.once('error', reject);
            child.once('spawn', () => {
                child.unref();
                resolve();
            });
        });
    }

    private formatCommandArg(arg: string): string {
        return /[\s"'\\]/.test(arg) ? JSON.stringify(arg) : arg;
    }

    private logOutput(output: string): void {
        const trimmedOutput = output.trim();
        if (!trimmedOutput) {
            return;
        }

        const maxLength = 4000;
        this.log?.(trimmedOutput.length > maxLength ? `${trimmedOutput.slice(0, maxLength)}...` : trimmedOutput);
    }

    private async getIosEmulators(): Promise<Emulator[]> {
        try {
            const output = await this.executeFile('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
            const data = JSON.parse(output) as SimctlListDevicesResult;
            const emulators: Emulator[] = [];

            for (const [runtime, devices] of Object.entries(data.devices)) {
                let osVersion = 'Unknown';
                const match = SIM_RUNTIME_VERSION_PATTERN.exec(runtime);
                if (match) {
                    osVersion = `${match[1]} ${match[2]}.${match[3]}`;
                } else {
                    const matchFallback = SIM_RUNTIME_FALLBACK_PATTERN.exec(runtime);
                    if (matchFallback) {
                        osVersion = matchFallback[1].replace(/-/g, '.');
                    }
                }

                for (const device of devices) {
                    emulators.push({
                        id: device.udid,
                        name: device.name,
                        os: 'iOS',
                        osVersion,
                        state: device.state === 'Booted' ? 'running' : 'stopped'
                    });
                }
            }
            return emulators;
        } catch (error) {
            this.logError('Failed to fetch iOS emulators', error);
            return [];
        }
    }

    private async getAndroidEmulators(): Promise<Emulator[]> {
        try {
            const androidHome = this.getAndroidSdkPath();
            const emulatorCommand = this.getAndroidToolPath(androidHome, 'emulator', 'emulator');

            const output = await this.executeFile(emulatorCommand, ['-list-avds']);
            const avds = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            const runningEmuNames = new Set<string>();
            try {
                const runningDevices = await this.getRunningAndroidDevices();
                runningDevices.forEach(device => runningEmuNames.add(device.avdName));
            } catch (error) {
                this.logError('Failed to list running Android emulators', error);
            }

            return avds.map(avd => {
                let osVersion = 'Unknown';
                try {
                    const content = this.getAndroidAvdConfigContent(avd);
                    if (content) {
                        osVersion = this.getAndroidOsVersionFromConfig(content);
                    }
                } catch (error) {
                    this.logError(`Failed to read Android AVD configuration for ${avd}`, error);
                }

                return {
                    id: avd,
                    name: avd.replace(/_/g, ' '),
                    os: 'Android',
                    osVersion,
                    state: runningEmuNames.has(avd) ? 'running' : 'stopped'
                };
            });
        } catch (error) {
            this.logError('Failed to fetch Android emulators', error);
            return [];
        }
    }

    public async startEmulator(emulator: Emulator, signal?: AbortSignal): Promise<void> {
        if (emulator.os === 'iOS') {
            await this.executeFile('xcrun', ['simctl', 'boot', emulator.id], { signal });
            this.log?.(`Waiting for iOS Simulator ${emulator.name} to finish booting.`);
            await this.executeFile('xcrun', ['simctl', 'bootstatus', emulator.id, '-b'], {
                signal,
                timeoutMs: IOS_BOOT_COMPLETION_TIMEOUT_MS
            });
            await this.executeFile('open', ['-a', 'Simulator'], { signal });
        } else {
            const androidHome = this.getAndroidSdkPath();
            const emulatorCommand = this.getAndroidToolPath(androidHome, 'emulator', 'emulator');
            this.throwIfCancelled(signal);
            await this.spawnDetached(emulatorCommand, ['-avd', emulator.id]);
            const serial = await this.waitForAndroidDevice(emulator, signal);
            await this.waitForAndroidBootCompletion(emulator, serial, signal);
        }
    }

    private async waitForAndroidDevice(emulator: Emulator, signal?: AbortSignal): Promise<string> {
        const deadline = Date.now() + ANDROID_DEVICE_DETECTION_TIMEOUT_MS;

        this.log?.(`Waiting for Android Emulator ${emulator.name} to appear in ADB.`);
        while (Date.now() < deadline) {
            this.throwIfCancelled(signal);
            const serial = await this.getRunningAndroidSerial(emulator.id, signal);
            if (serial) {
                this.log?.(`Android Emulator ${emulator.name} is available in ADB as ${serial}.`);
                return serial;
            }

            await this.sleep(STARTUP_POLL_INTERVAL_MS, signal);
        }

        throw new Error(`Timed out waiting for ${emulator.name} to appear in ADB.`);
    }

    private async waitForAndroidBootCompletion(emulator: Emulator, serial: string, signal?: AbortSignal): Promise<void> {
        const deadline = Date.now() + ANDROID_BOOT_COMPLETION_TIMEOUT_MS;
        const adbCommand = this.getAdbCommand();

        this.log?.(`Waiting for Android Emulator ${emulator.name} to finish booting.`);
        while (Date.now() < deadline) {
            try {
                this.throwIfCancelled(signal);
                const bootCompleted = await this.executeFile(adbCommand, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { signal });
                if (bootCompleted.trim() === '1') {
                    this.log?.(`Android Emulator ${emulator.name} finished booting.`);
                    return;
                }
            } catch (error) {
                this.throwIfCancelled(signal);
                this.logError(`Failed to check Android boot status for ${emulator.name}`, error);
            }

            await this.sleep(STARTUP_POLL_INTERVAL_MS, signal);
        }

        throw new Error(`Timed out waiting for ${emulator.name} to finish booting.`);
    }

    private throwIfCancelled(signal?: AbortSignal): void {
        if (signal?.aborted) {
            throw new Error('Operation cancelled.');
        }
    }

    private sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            this.throwIfCancelled(signal);

            const onAbort = () => {
                clearTimeout(timer);
                reject(new Error('Operation cancelled.'));
            };
            const timer = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, durationMs);

            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    public async stopEmulator(emulator: Emulator, signal?: AbortSignal): Promise<void> {
        if (emulator.os === 'iOS') {
            await this.executeFile('xcrun', ['simctl', 'shutdown', emulator.id], { signal });
        } else {
            const serial = await this.getRunningAndroidSerial(emulator.id, signal);
            if (!serial) {
                throw new Error(`${emulator.name} is not running or its ADB serial could not be found.`);
            }

            await this.executeFile(this.getAdbCommand(), ['-s', serial, 'emu', 'kill'], { signal });
        }
    }

    public async installApp(emulator: Emulator, appPath: string, signal?: AbortSignal): Promise<void> {
        if (emulator.os === 'Android') {
            await this.installAndroidApp(emulator, appPath, signal);
        } else {
            await this.installIosApp(emulator, appPath, signal);
        }
    }

    private async installAndroidApp(emulator: Emulator, apkPath: string, signal?: AbortSignal): Promise<void> {
        if (path.extname(apkPath).toLowerCase() !== '.apk') {
            throw new Error('Please select an .apk file for Android emulators.');
        }

        const serial = await this.getRunningAndroidSerial(emulator.id, signal);
        if (!serial) {
            throw new Error(`${emulator.name} is not running.`);
        }

        await this.executeFile(this.getAdbCommand(), ['-s', serial, 'install', '-r', apkPath], {
            signal,
            timeoutMs: APP_INSTALL_TIMEOUT_MS
        });
    }

    private async installIosApp(emulator: Emulator, ipaPath: string, signal?: AbortSignal): Promise<void> {
        if (path.extname(ipaPath).toLowerCase() !== '.ipa') {
            throw new Error('Please select an .ipa file for iOS simulators.');
        }

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-emulator-ipa-'));
        try {
            await this.executeFile('/usr/bin/unzip', ['-q', ipaPath, '-d', tempDir], {
                signal,
                timeoutMs: APP_INSTALL_TIMEOUT_MS
            });
            const payloadDir = path.join(tempDir, 'Payload');
            if (!fs.existsSync(payloadDir)) {
                throw new Error('The selected .ipa does not contain a Payload directory.');
            }

            const appName = fs.readdirSync(payloadDir).find(entry => entry.toLowerCase().endsWith('.app'));
            if (!appName) {
                throw new Error('The selected .ipa does not contain an app bundle.');
            }

            await this.executeFile('xcrun', ['simctl', 'install', emulator.id, path.join(payloadDir, appName)], {
                signal,
                timeoutMs: APP_INSTALL_TIMEOUT_MS
            });
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    public async getRunningAndroidSerial(avdName: string, signal?: AbortSignal): Promise<string | undefined> {
        const runningDevices = await this.getRunningAndroidDevices(signal);
        return runningDevices.find(device => device.avdName === avdName)?.serial;
    }

    private async getRunningAndroidDevices(signal?: AbortSignal): Promise<RunningAndroidDevice[]> {
        const adbCommand = this.getAdbCommand();
        const adbOutput = await this.executeFile(adbCommand, ['devices'], { signal });
        const devices: RunningAndroidDevice[] = [];

        for (const line of adbOutput.split('\n')) {
            const serial = this.getAdbDeviceSerial(line);
            if (!serial) {
                continue;
            }

            const avdName = await this.getAndroidAvdName(adbCommand, serial, signal);
            if (avdName) {
                devices.push({ avdName, serial });
            }
        }

        return devices;
    }

    private getAdbDeviceSerial(line: string): string | undefined {
        const [serial, state] = line.split('\t');
        return serial?.startsWith('emulator-') && state?.trim() === 'device' ? serial : undefined;
    }

    private async getAndroidAvdName(adbCommand: string, serial: string, signal?: AbortSignal): Promise<string | undefined> {
        try {
            const avdNameOut = await this.executeFile(adbCommand, ['-s', serial, 'emu', 'avd', 'name'], { signal });
            return avdNameOut.split('\n')[0]?.trim() || undefined;
        } catch (error) {
            this.throwIfCancelled(signal);
            this.logError(`Failed to query Android AVD name for ${serial}`, error);
        }

        return undefined;
    }

    private logError(message: string, error: unknown): void {
        this.log?.(`${message}: ${this.getErrorMessage(error)}`);
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
