import type { Emulator } from "./emulatorService";

export function getFavoriteEmulatorKey(
    emulator: Pick<Emulator, "id" | "os">,
): string {
    return `${emulator.os}:${emulator.id}`;
}

export function getFavoriteEmulatorKeys(value: unknown): Set<string> {
    if (!Array.isArray(value)) {
        return new Set();
    }

    return new Set(
        value
            .filter((key): key is string => typeof key === "string")
            .map((key) => key.trim())
            .filter((key) => key.length > 0),
    );
}
