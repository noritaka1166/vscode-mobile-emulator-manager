import { exec } from 'child_process';
import * as os from 'os';
import * as path from 'path';

export interface Emulator {
    id: string; // uuid for iOS, name for Android
    name: string;
    os: 'iOS' | 'Android';
    state: 'running' | 'stopped';
}

export class EmulatorService {
    
    public async getEmulators(): Promise<Emulator[]> {
        const iosEmulators = await this.getIosEmulators();
        const androidEmulators = await this.getAndroidEmulators();
        return [...iosEmulators, ...androidEmulators];
    }

    private executeCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
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
                for (const device of data.devices[runtime]) {
                    emulators.push({
                        id: device.udid,
                        name: device.name,
                        os: 'iOS',
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
            const androidHome = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library', 'Android', 'sdk');
            const emulatorCommand = path.join(androidHome, 'emulator', 'emulator');
            
            const output = await this.executeCommand(`"${emulatorCommand}" -list-avds`);
            const avds = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            const adbCommand = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb') : 'adb';
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

            return avds.map(avd => ({
                id: avd,
                name: avd.replace(/_/g, ' '),
                os: 'Android',
                state: runningEmuNames.includes(avd) ? 'running' : 'stopped'
            }));
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
            const androidHome = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library', 'Android', 'sdk');
            const emulatorCommand = path.join(androidHome, 'emulator', 'emulator');
            const { spawn } = require('child_process');
            const child = spawn(emulatorCommand, ['-avd', emulator.id], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
        }
    }

    public async stopEmulator(emulator: Emulator): Promise<void> {
        if (emulator.os === 'iOS') {
            await this.executeCommand(`xcrun simctl shutdown ${emulator.id}`);
        } else {
            const adbCommand = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb') : 'adb';
            const adbOutput = await this.executeCommand(`"${adbCommand}" devices`);
            const lines = adbOutput.split('\n');
            for (const line of lines) {
                if (line.startsWith('emulator-') && line.includes('device')) {
                    const serial = line.split('\t')[0];
                    try {
                        const avdNameOut = await this.executeCommand(`"${adbCommand}" -s ${serial} emu avd name`);
                        const avdNameLines = avdNameOut.split('\n');
                        if (avdNameLines.length > 0 && avdNameLines[0].trim() === emulator.id) {
                            await this.executeCommand(`"${adbCommand}" -s ${serial} emu kill`);
                            return;
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }
        }
    }
}
