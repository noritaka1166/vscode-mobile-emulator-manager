import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { getFavoriteEmulatorKey, getFavoriteEmulatorKeys } from "../favorites";

test("favorite keys distinguish iOS and Android device IDs", () => {
    equal(getFavoriteEmulatorKey({ id: "same-id", os: "iOS" }), "iOS:same-id");
    equal(
        getFavoriteEmulatorKey({ id: "same-id", os: "Android" }),
        "Android:same-id",
    );
});

test("favorite keys discard invalid and duplicate values", () => {
    deepEqual(
        Array.from(getFavoriteEmulatorKeys([" iOS:one ", "iOS:one", 1, ""])),
        ["iOS:one"],
    );
});
