import { runTests } from "@vscode/test-electron";
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

function findCodeExecutable() {
  const configured = process.env.VSCODE_EXECUTABLE;
  if (configured && existsSync(configured)) {
    return configured;
  }

  try {
    const locator = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(locator, ["code"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\r?\n/)[0];
    if (!output) {
      return undefined;
    }
    const resolved = realpathSync(output);
    const candidates =
      process.platform === "win32"
        ? [
            resolve(dirname(resolved), "..", "Code.exe"),
            resolved,
          ]
        : [
            resolved,
            resolve(dirname(resolved), "..", "..", "MacOS", "Electron"),
          ];
    return candidates.find((candidate) => existsSync(candidate));
  } catch {
    return undefined;
  }
}

const vscodeExecutablePath = findCodeExecutable();
if (!vscodeExecutablePath) {
  console.error(
    "Could not locate the VS Code executable.\n" +
      "Set VSCODE_EXECUTABLE to the Code executable and try again.",
  );
  process.exit(1);
}

const testData = join(root, ".vscode-test");
await rm(join(testData, "user-data"), { recursive: true, force: true });
await rm(join(testData, "extensions"), { recursive: true, force: true });
await mkdir(testData, { recursive: true });

try {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, ".test-dist", "suite.js"),
    launchArgs: [
      "--disable-extensions",
      "--disable-gpu",
      `--user-data-dir=${join(testData, "user-data")}`,
      `--extensions-dir=${join(testData, "extensions")}`,
    ],
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
