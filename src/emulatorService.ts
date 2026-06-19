import { exec, execFile } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

export interface Emulator {
    id: string; // uuid for iOS, name for Android
    name: string;
    os: 'iOS' | 'Android';
    osVersion?: string;
    state: 'running' | 'stopped';
}

export class EmulatorService {
    private getAdbCommand(): string {
        const configuredOrEnvSdkPath = this.getConfiguredAndroidSdkPath() || process.env.ANDROID_HOME?.trim();
        if (configuredOrEnvSdkPath) {
            return path.join(this.expandHome(configuredOrEnvSdkPath), 'platform-tools', 'adb');
        }

        const defaultAdbCommand = path.join(this.getDefaultAndroidSdkPath(), 'platform-tools', 'adb');
        return fs.existsSync(defaultAdbCommand) ? defaultAdbCommand : 'adb';
    }

    private getAndroidSdkPath(): string {
        const configuredSdkPath = this.getConfiguredAndroidSdkPath();
        if (configuredSdkPath) {
            return configuredSdkPath;
        }

        const androidHome = process.env.ANDROID_HOME?.trim();
        return androidHome ? this.expandHome(androidHome) : this.getDefaultAndroidSdkPath();
    }

    private getConfiguredAndroidSdkPath(): string | undefined {
        const configuredPath = vscode.workspace
            .getConfiguration('mobileEmulatorManager')
            .get<string>('androidSdkPath')
            ?.trim();

        return configuredPath ? this.expandHome(configuredPath) : undefined;
    }

    private getDefaultAndroidSdkPath(): string {
        return path.join(os.homedir(), 'Library', 'Android', 'sdk');
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
        const mapping: Record<string, string> = {
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
        return mapping[apiLevel] ? `${mapping[apiLevel]} (API ${apiLevel})` : `API ${apiLevel}`;
    }

    private getAndroidAvdConfigPath(avdName: string): string | undefined {
        const avdRoot = path.join(os.homedir(), '.android', 'avd');
        const directConfigPath = path.join(avdRoot, `${avdName}.avd`, 'config.ini');
        if (fs.existsSync(directConfigPath)) {
            return directConfigPath;
        }

        const metadataPath = path.join(avdRoot, `${avdName}.ini`);
        if (!fs.existsSync(metadataPath)) {
            return undefined;
        }

        const metadata = fs.readFileSync(metadataPath, 'utf-8');
        const absoluteAvdPath = this.getIniValue(metadata, 'path');
        const relativeAvdPath = this.getIniValue(metadata, 'path.rel');
        const avdPath = absoluteAvdPath || relativeAvdPath;
        if (!avdPath) {
            return undefined;
        }

        const resolvedAvdPath = path.isAbsolute(avdPath) ? avdPath : path.join(os.homedir(), '.android', avdPath);
        const configPath = path.join(resolvedAvdPath, 'config.ini');
        return fs.existsSync(configPath) ? configPath : undefined;
    }

    private getIniValue(content: string, key: string): string | undefined {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(`^${escapedKey}\\s*=\\s*(.+)$`, 'm').exec(content);
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

    private async isAndroidEmulatorRunning(avdName: string): Promise<boolean> {
        const adbCommand = this.getAdbCommand();
        try {
            const adbOutput = await this.executeCommand(`"${adbCommand}" devices`);
            const lines = adbOutput.split('\n');
            for (const line of lines) {
                if (line.startsWith('emulator-') && line.includes('device')) {
                    const serial = line.split('\t')[0];
                    try {
                        const avdNameOut = await this.executeCommand(`"${adbCommand}" -s ${serial} emu avd name`);
                        const avdNameLines = avdNameOut.split('\n');
                        if (avdNameLines.length > 0 && avdNameLines[0].trim() === avdName) {
                            return true;
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }
        } catch (error) {
            // ignore
        }
        return false;
    }

    public async getEmulators(): Promise<Emulator[]> {
        const iosEmulators = await this.getIosEmulators();
        const androidEmulators = await this.getAndroidEmulators();
        return [...iosEmulators, ...androidEmulators];
    }

    private executeCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr.trim() || error.message));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    private executeFile(command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            execFile(command, args, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr.trim() || error.message));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    private async getIosEmulators(): Promise<Emulator[]> {
        try {
            const output = await this.executeCommand('xcrun simctl list devices available --json');
            const data = JSON.parse(output);
            const emulators: Emulator[] = [];
            
            for (const runtime of Object.keys(data.devices)) {
                let osVersion = 'Unknown';
                const runtimeRegex = /SimRuntime\.(.+?)-(\d+)-(\d+)/;
                const match = runtimeRegex.exec(runtime);
                if (match) {
                    osVersion = `${match[1]} ${match[2]}.${match[3]}`;
                } else {
                    const fallbackRegex = /SimRuntime\.(.+)$/;
                    const matchFallback = fallbackRegex.exec(runtime);
                    if (matchFallback) {
                        osVersion = matchFallback[1].replace(/-/g, '.');
                    }
                }

                for (const device of data.devices[runtime]) {
                    emulators.push({
                        id: device.udid,
                        name: device.name,
                        os: 'iOS',
                        osVersion: osVersion,
                        state: device.state === 'Booted' ? 'running' : 'stopped'
                    });
                }
            }
            return emulators;
        } catch (error) {
            console.error('Failed to fetch iOS emulators', error);
            return [];
        }
    }

    private async getAndroidEmulators(): Promise<Emulator[]> {
        try {
            const androidHome = this.getAndroidSdkPath();
            const emulatorCommand = path.join(androidHome, 'emulator', 'emulator');
            
            const output = await this.executeCommand(`"${emulatorCommand}" -list-avds`);
            const avds = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            const adbCommand = this.getAdbCommand();
            let runningEmuNames: string[] = [];
            try {
                const adbOutput = await this.executeCommand(`"${adbCommand}" devices`);
                const lines = adbOutput.split('\n');
                for (const line of lines) {
                    if (line.startsWith('emulator-') && line.includes('device')) {
                        const serial = line.split('\t')[0];
                        try {
                            const avdNameOut = await this.executeCommand(`"${adbCommand}" -s ${serial} emu avd name`);
                            const avdNameLines = avdNameOut.split('\n');
                            if (avdNameLines.length > 0) {
                                runningEmuNames.push(avdNameLines[0].trim());
                            }
                        } catch (e) {
                            // ignore errors querying specific device
                        }
                    }
                }
            } catch (error) {
                // Ignore adb error
            }

            return avds.map(avd => {
                let osVersion = 'Unknown';
                try {
                    const iniPath = this.getAndroidAvdConfigPath(avd);
                    if (iniPath && fs.existsSync(iniPath)) {
                        const content = fs.readFileSync(iniPath, 'utf-8');
                        osVersion = this.getAndroidOsVersionFromConfig(content);
                    }
                } catch (e) {
                    // ignore errors reading config.ini
                }

                return {
                    id: avd,
                    name: avd.replace(/_/g, ' '),
                    os: 'Android',
                    osVersion: osVersion,
                    state: runningEmuNames.includes(avd) ? 'running' : 'stopped'
                };
            });
        } catch (error) {
            console.error('Failed to fetch Android emulators', error);
            return [];
        }
    }

    public async startEmulator(emulator: Emulator): Promise<void> {
        if (emulator.os === 'iOS') {
            await this.executeCommand(`xcrun simctl boot ${emulator.id}`);
            await this.executeCommand(`open -a Simulator`);
        } else {
            const androidHome = this.getAndroidSdkPath();
            const emulatorCommand = path.join(androidHome, 'emulator', 'emulator');
            const { spawn } = require('node:child_process');
            const child = spawn(emulatorCommand, ['-avd', emulator.id], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            let retries = 30; // Wait up to 60 seconds
            while (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const isRunning = await this.isAndroidEmulatorRunning(emulator.id);
                if (isRunning) {
                    break;
                }
                retries--;
            }
        }
    }

    public async stopEmulator(emulator: Emulator): Promise<void> {
        if (emulator.os === 'iOS') {
            await this.executeCommand(`xcrun simctl shutdown ${emulator.id}`);
        } else {
            const serial = await this.getRunningAndroidSerial(emulator.id);
            if (serial) {
                await this.executeFile(this.getAdbCommand(), ['-s', serial, 'emu', 'kill']);
            }
        }
    }

    public async installApp(emulator: Emulator, appPath: string): Promise<void> {
        if (emulator.os === 'Android') {
            await this.installAndroidApp(emulator, appPath);
        } else {
            await this.installIosApp(emulator, appPath);
        }
    }

    private async installAndroidApp(emulator: Emulator, apkPath: string): Promise<void> {
        if (path.extname(apkPath).toLowerCase() !== '.apk') {
            throw new Error('Please select an .apk file for Android emulators.');
        }

        const serial = await this.getRunningAndroidSerial(emulator.id);
        if (!serial) {
            throw new Error(`${emulator.name} is not running.`);
        }

        await this.executeFile(this.getAdbCommand(), ['-s', serial, 'install', '-r', apkPath]);
    }

    private async installIosApp(emulator: Emulator, ipaPath: string): Promise<void> {
        if (path.extname(ipaPath).toLowerCase() !== '.ipa') {
            throw new Error('Please select an .ipa file for iOS simulators.');
        }

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-emulator-ipa-'));
        try {
            await this.executeFile('/usr/bin/unzip', ['-q', ipaPath, '-d', tempDir]);
            const payloadDir = path.join(tempDir, 'Payload');
            if (!fs.existsSync(payloadDir)) {
                throw new Error('The selected .ipa does not contain a Payload directory.');
            }

            const appName = fs.readdirSync(payloadDir).find(entry => entry.toLowerCase().endsWith('.app'));
            if (!appName) {
                throw new Error('The selected .ipa does not contain an app bundle.');
            }

            await this.executeFile('xcrun', ['simctl', 'install', emulator.id, path.join(payloadDir, appName)]);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    public async getRunningAndroidSerial(avdName: string): Promise<string | undefined> {
        const adbCommand = this.getAdbCommand();
        const adbOutput = await this.executeCommand(`"${adbCommand}" devices`);
        const lines = adbOutput.split('\n');
        for (const line of lines) {
            if (line.startsWith('emulator-') && line.includes('device')) {
                const serial = line.split('\t')[0];
                try {
                    const avdNameOut = await this.executeCommand(`"${adbCommand}" -s ${serial} emu avd name`);
                    const avdNameLines = avdNameOut.split('\n');
                    if (avdNameLines.length > 0 && avdNameLines[0].trim() === avdName) {
                        return serial;
                    }
                } catch (e) {
                    // ignore errors querying specific device
                }
            }
        }
        return undefined;
    }
}
