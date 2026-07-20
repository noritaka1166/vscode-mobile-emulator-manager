import { deepEqual, equal } from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { getAndroidToolPath, getDefaultAndroidSdkPaths } from '../androidSdk';

test('macOS uses the standard Android SDK path', () => {
    deepEqual(getDefaultAndroidSdkPaths('darwin', '/Users/example'), [
        path.join('/Users/example', 'Library', 'Android', 'sdk')
    ]);
});

test('Windows prefers LOCALAPPDATA and retains the user-profile fallback', () => {
    deepEqual(getDefaultAndroidSdkPaths('win32', '/Users/example', '/Users/example/AppData/Local'), [
        path.join('/Users/example/AppData/Local', 'Android', 'Sdk'),
        path.join('/Users/example', 'AppData', 'Local', 'Android', 'Sdk')
    ]);
});

test('Linux checks both common SDK path casings', () => {
    deepEqual(getDefaultAndroidSdkPaths('linux', '/home/example'), [
        path.join('/home/example', 'Android', 'Sdk'),
        path.join('/home/example', 'Android', 'sdk')
    ]);
});

test('Windows tools use the .exe extension', () => {
    equal(
        getAndroidToolPath('/sdk', 'platform-tools', 'adb', 'win32'),
        path.join('/sdk', 'platform-tools', 'adb.exe')
    );
});

test('Unix tools do not use a file extension', () => {
    equal(
        getAndroidToolPath('/sdk', 'emulator', 'emulator', 'linux'),
        path.join('/sdk', 'emulator', 'emulator')
    );
});
