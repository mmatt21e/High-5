import sharp from "sharp";
import { AVATAR_DATA_PREFIX, AVATAR_MAX_UPLOAD_BYTES } from "../lib/avatars";

export async function normalizeAvatar(bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0 || bytes.length > AVATAR_MAX_UPLOAD_BYTES) throw new Error("Choose an image smaller than 2 MB.");
  const header = Buffer.from(bytes.subarray(0, 12));
  const raster = header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) ||
    (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP");
  if (!raster) throw new Error("Choose a JPEG, PNG or WebP image.");
  // Decode a raster, bound decompression, strip metadata, rotate from EXIF and
  // encode a single, small WebP. SVGs and animated images are not accepted.
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
    throw new Error("Choose a still JPEG, PNG or WebP image.");
  }
  const output = await image.rotate().resize(128, 128, { fit: "cover", position: "centre" }).webp({ quality: 80 }).toBuffer();
  return AVATAR_DATA_PREFIX + output.toString("base64");
}
