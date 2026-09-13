import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Raster versions of the existing game icon for Android and Apple home screens.
const directory = new URL("../public/icons/", import.meta.url);
const source = await readFile(new URL("../public/icon.svg", import.meta.url));
const background = "#0e3a24";
await mkdir(directory, { recursive: true });
for (const [name, size] of [["five-o-192", 192], ["five-o-512", 512], ["apple-touch-icon", 180]]) {
  await sharp(source).resize(size, size).flatten({ background }).png()
    .toFile(fileURLToPath(new URL(`${name}.png`, directory)));
}
// Keep the existing artwork inside the maskable icon's central safe area.
await sharp(source).resize(384, 384).flatten({ background })
  .extend({ top: 64, bottom: 64, left: 64, right: 64, background }).png()
  .toFile(fileURLToPath(new URL("five-o-maskable-512.png", directory)));
