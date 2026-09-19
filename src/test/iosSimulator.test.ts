import { equal, throws } from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { getIosSimulatorAppPath } from "../iosSimulator";

test("resolves the UI bundled with each selected Xcode installation", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ios-simulator-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const xcode27 = path.join(root, "Xcode 27.app", "Contents", "Developer");
    const deviceHub = path.join(xcode27, "..", "Applications", "DeviceHub.app");
    fs.mkdirSync(deviceHub, { recursive: true });
    equal(getIosSimulatorAppPath(xcode27), deviceHub);

    const xcode26 = path.join(root, "Xcode 26.app", "Contents", "Developer");
    const simulator = path.join(xcode26, "Applications", "Simulator.app");
    fs.mkdirSync(simulator, { recursive: true });
    equal(getIosSimulatorAppPath(xcode26), simulator);

    // A legacy UI in the same bundle must not override Device Hub.
    fs.mkdirSync(path.join(xcode27, "Applications", "Simulator.app"), {
        recursive: true,
    });
    equal(getIosSimulatorAppPath(xcode27), deviceHub);

    // Do not open another installation's UI when the active Xcode lacks one.
    throws(
        () => getIosSimulatorAppPath(path.join(root, "CommandLineTools")),
        /Could not find Device Hub or Simulator.*xcode-select or DEVELOPER_DIR/,
    );
});
