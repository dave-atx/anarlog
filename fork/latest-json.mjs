#!/usr/bin/env node
// Emits Tauri updater manifest latest.json for fork releases.
// Usage: node fork/latest-json.mjs --version 1.4.16 --sig-file path/to/Anarlog.app.tar.gz.sig --url https://github.com/dave-atx/anarlog/releases/download/fork_v1.4.16/Anarlog.app.tar.gz

import { readFileSync } from "node:fs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return process.argv[i + 1];
}

const version = arg("version");
const sigFile = arg("sig-file");
const url = arg("url");

const signature = readFileSync(sigFile, "utf8").trim();

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": {
      signature,
      url,
    },
  },
};

console.log(JSON.stringify(manifest, null, 2));
