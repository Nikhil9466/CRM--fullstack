import { copyFile } from "node:fs/promises";
await copyFile(
  new URL("../front end/session.js", import.meta.url),
  new URL("../front end/dist/session.js", import.meta.url),
);
