import { spawn } from "node:child_process";
import { log } from "node:console";
import process from "node:process";

if (!process.env.ARGOS_TOKEN) {
  log("Skipping Storybook deploy: ARGOS_TOKEN is not configured.");
  process.exit(0);
}

const child = spawn("argos", ["deploy", "storybook-static"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
