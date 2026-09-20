import { deepEqual, equal } from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import {
    getAndroidLaunchProfiles,
    getAndroidEmulatorStartArgs,
    getAndroidToolPath,
    getDefaultAndroidSdkPaths,
} from "../androidSdk";

test("macOS uses the standard Android SDK path", () => {
    deepEqual(getDefaultAndroidSdkPaths("darwin", "/Users/example"), [
        path.join("/Users/example", "Library", "Android", "sdk"),
    ]);
});

test("Windows prefers LOCALAPPDATA and retains the user-profile fallback", () => {
    deepEqual(
        getDefaultAndroidSdkPaths(
            "win32",
            "/Users/example",
            "/Users/example/AppData/Local",
        ),
        [
            path.join("/Users/example/AppData/Local", "Android", "Sdk"),
            path.join("/Users/example", "AppData", "Local", "Android", "Sdk"),
        ],
    );
});

test("Linux checks both common SDK path casings", () => {
    deepEqual(getDefaultAndroidSdkPaths("linux", "/home/example"), [
        path.join("/home/example", "Android", "Sdk"),
        path.join("/home/example", "Android", "sdk"),
    ]);
});

test("Windows tools use the .exe extension", () => {
    equal(
        getAndroidToolPath("/sdk", "platform-tools", "adb", "win32"),
        path.join("/sdk", "platform-tools", "adb.exe"),
    );
});

test("Unix tools do not use a file extension", () => {
    equal(
        getAndroidToolPath("/sdk", "emulator", "emulator", "linux"),
        path.join("/sdk", "emulator", "emulator"),
    );
});

test("cold boot disables loading the AVD snapshot", () => {
    deepEqual(getAndroidEmulatorStartArgs("Pixel_9", { coldBoot: true }), [
        "-avd",
        "Pixel_9",
        "-no-snapshot-load",
    ]);
    deepEqual(getAndroidEmulatorStartArgs("Pixel_9"), ["-avd", "Pixel_9"]);
});

test("launch options map to Android Emulator arguments", () => {
    deepEqual(
        getAndroidEmulatorStartArgs("Pixel_9", {
            disableBootAnimation: true,
            disableAudio: true,
            gpuMode: "software",
            memoryMb: 4096,
            additionalArgs: ["-no-snapshot-save"],
        }),
        [
            "-avd",
            "Pixel_9",
            "-no-boot-anim",
            "-no-audio",
            "-gpu",
            "software",
            "-memory",
            "4096",
            "-no-snapshot-save",
        ],
    );
});

test("launch profiles keep one profile for each case-insensitive name", () => {
    const profiles = getAndroidLaunchProfiles([
        { name: "Light", options: { disableAudio: true } },
        { name: "light", options: { coldBoot: true } },
        { name: "", options: {} },
    ]);

    deepEqual(profiles, [
        {
            name: "light",
            options: {
                coldBoot: true,
                disableBootAnimation: false,
                disableAudio: false,
                gpuMode: "default",
                memoryMb: undefined,
                additionalArgs: [],
            },
        },
    ]);
});
