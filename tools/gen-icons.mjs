#!/usr/bin/env node
/* global console */
// Dev-only: rasterize the master mark (assets/logo.svg) into the app icons the
// packager and OS need — assets/icons/{icon.png, icon.ico, icon.icns}. Run it
// after changing the logo: `node tools/gen-icons.mjs`. The generated files are
// committed, so CI/packaging never runs this (it's not a build step).

import { Resvg } from '@resvg/resvg-js';
import png2icons from 'png2icons';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'assets', 'logo.svg'));
const outDir = path.join(root, 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

/** Render the SVG to a square PNG buffer of the given pixel width. */
function png(size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

const master = png(1024);
// Linux desktop entry / packager base PNG.
fs.writeFileSync(path.join(outDir, 'icon.png'), png(512));
// Windows .ico and macOS .icns (PNG-backed, all sizes down-scaled by png2icons).
fs.writeFileSync(path.join(outDir, 'icon.ico'), png2icons.createICO(master, png2icons.BICUBIC, 0, true));
fs.writeFileSync(path.join(outDir, 'icon.icns'), png2icons.createICNS(master, png2icons.BICUBIC, 0));

for (const f of ['icon.png', 'icon.ico', 'icon.icns']) {
  console.log(`  ${path.join('assets', 'icons', f)}  (${fs.statSync(path.join(outDir, f)).size} bytes)`);
}
