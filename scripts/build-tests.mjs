import { build } from "esbuild";

await build({
  entryPoints: ["test/suite/suite.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: ".test-dist/suite.js",
  external: ["vscode"],
  sourcemap: false,
  logLevel: "info",
});
