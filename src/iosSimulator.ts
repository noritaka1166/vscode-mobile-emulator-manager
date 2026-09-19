import * as fs from "node:fs";
import * as path from "node:path";

export function getIosSimulatorAppPath(developerDirectory: string): string {
    // Xcode 27 moved the simulator UI to Contents/Applications/DeviceHub.app.
    // Resolve within the active Xcode so side-by-side installations stay aligned
    // with the developer tools used by xcrun simctl.
    const candidates = [
        path.join(developerDirectory, "..", "Applications", "DeviceHub.app"),
        path.join(developerDirectory, "Applications", "Simulator.app"),
    ];
    const appPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!appPath) {
        throw new Error(
            `Could not find Device Hub or Simulator in the selected Xcode developer directory: ${developerDirectory}. Check your xcode-select or DEVELOPER_DIR configuration.`,
        );
    }
    return appPath;
}
