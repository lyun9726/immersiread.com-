import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const workerSource = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const targetPath = resolve("public", "pdf.worker.min.mjs");

mkdirSync(dirname(targetPath), { recursive: true });
copyFileSync(workerSource, targetPath);
console.log(`[copy-pdf-worker] Copied ${workerSource} -> ${targetPath}`);
