#!/usr/bin/env node
// Fails when the documented route list drifts from the routes registered in the Worker.
// Docs source: web/src/data/routes.json · Code source: src/index.ts
import { readFile } from "node:fs/promises";

const docsRaw = await readFile(new URL("../web/src/data/routes.json", import.meta.url), "utf8");
const codePath = new URL("../src/index.ts", import.meta.url);
const codeRaw = await readFile(codePath, "utf8");

const docs = JSON.parse(docsRaw);
const code = [...codeRaw.matchAll(/route\("([A-Z]+)",\s*"([^"]+)"/g)].map((match) => ({
  method: match[1],
  path: match[2],
}));

const key = (entry) => `${entry.method} ${entry.path}`;
const docKeys = new Set(docs.map(key));
const codeKeys = new Set(code.map(key));

const undocumented = [...codeKeys].filter((entry) => !docKeys.has(entry));
const phantom = [...docKeys].filter((entry) => !codeKeys.has(entry));
const duplicates = docs.map(key).filter((entry, index, all) => all.indexOf(entry) !== index);

console.log(`worker routes: ${codeKeys.size}`);
console.log(`documented:    ${docKeys.size}`);

if (undocumented.length > 0) console.error("missing from docs:\n  " + undocumented.join("\n  "));
if (phantom.length > 0) console.error("documented but not implemented:\n  " + phantom.join("\n  "));
if (duplicates.length > 0) console.error("duplicate doc entries:\n  " + duplicates.join("\n  "));

if (undocumented.length + phantom.length + duplicates.length > 0) process.exit(1);
console.log("docs match the worker route table");
