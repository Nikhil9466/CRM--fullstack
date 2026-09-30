import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const children = [
  spawn(process.execPath, ["src/server.js"], {
    cwd: root + "/crm-backend",
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: process.env.CRM_DEV_API_PORT || "4000",
      APP_ORIGIN: "http://localhost:5173",
    },
  }),
  spawn(process.execPath, [root + "/node_modules/vite/bin/vite.js"], {
    cwd: root,
    stdio: "inherit",
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
