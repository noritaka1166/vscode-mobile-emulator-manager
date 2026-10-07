import { deepEqual, equal } from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import {
    getAndroidEmulatorStartArgs,
    getAndroidLaunchProfiles,
    getAndroidToolPath,
    getDefaultAndroidSdkPaths,
    mergeAndroidLaunchOptions,
    normalizeAndroidLaunchOptions,
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

test("starting with newly saved defaults does not duplicate additional arguments", () => {
    const saved = normalizeAndroidLaunchOptions({
        additionalArgs: ["-gpu", "software", "-no-snapshot-save"],
    });

    deepEqual(
        getAndroidEmulatorStartArgs(
            "Pixel_9",
            mergeAndroidLaunchOptions(saved, saved),
        ),
        ["-avd", "Pixel_9", "-gpu", "software", "-no-snapshot-save"],
    );
});

test("explicit launch options replace saved arguments and override saved fields", () => {
    const saved = normalizeAndroidLaunchOptions({
        coldBoot: true,
        disableAudio: true,
        additionalArgs: ["-gpu", "host"],
    });

    deepEqual(
        getAndroidEmulatorStartArgs(
            "Pixel_9",
            mergeAndroidLaunchOptions(saved, {
                coldBoot: false,
                additionalArgs: ["-gpu", "software"],
            }),
        ),
        ["-avd", "Pixel_9", "-no-audio", "-gpu", "software"],
    );
});

test("omitted additional arguments retain defaults and configured arguments", () => {
    const saved = normalizeAndroidLaunchOptions({
        additionalArgs: ["-no-snapshot-save"],
    });

    deepEqual(
        getAndroidEmulatorStartArgs(
            "Pixel_9",
            mergeAndroidLaunchOptions(saved, { coldBoot: true }, ["-verbose"]),
        ),
        [
            "-avd",
            "Pixel_9",
            "-no-snapshot-load",
            "-verbose",
            "-no-snapshot-save",
        ],
    );
});

test("empty explicit arguments clear saved arguments but retain configured arguments", () => {
    const saved = normalizeAndroidLaunchOptions({
        additionalArgs: ["-gpu", "host"],
    });

    deepEqual(
        getAndroidEmulatorStartArgs(
            "Pixel_9",
            mergeAndroidLaunchOptions(saved, { additionalArgs: [] }, [
                "-verbose",
            ]),
        ),
        ["-avd", "Pixel_9", "-verbose"],
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
