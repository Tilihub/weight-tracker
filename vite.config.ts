import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// After a build, writes two lines at the top of dist/sw.js: VERSION, a text
// that differs on every build, and FILES, the list of built files. The worker
// saves that list, and the new VERSION makes browsers install the worker again.
function workerFiles(): Plugin {
  return {
    name: "worker-files",
    // Builds only. The dev server also calls closeBundle when it shuts down,
    // which would add the lines again to the dist/sw.js of an earlier build.
    apply: "build",
    closeBundle() {
      const files = readdirSync("dist", { recursive: true, encoding: "utf8" })
        .filter((name) => statSync(`dist/${name}`).isFile())
        .filter((name) => name !== "sw.js")
        .map((name) => `./${name}`);
      const list = ["./", ...files];
      const version = String(Date.now());

      const header =
        `const VERSION = ${JSON.stringify(version)};\n` +
        `const FILES = ${JSON.stringify(list)};\n`;
      const worker = readFileSync("dist/sw.js", "utf8");
      writeFileSync("dist/sw.js", header + worker);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), workerFiles()],
  base: "./",
  appType: "mpa",
});
