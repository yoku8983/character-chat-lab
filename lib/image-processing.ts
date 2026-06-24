import sharp from "sharp";

const MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB
const OUTPUT_SIZE = 128;
const WEBP_QUALITY = 80;

export class ImageTooLargeError extends Error {
  constructor() {
    super("Image exceeds 10MB limit");
  }
}

export async function processProfileImage(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_INPUT_SIZE) {
    throw new ImageTooLargeError();
  }

  const webpBuffer = await sharp(buffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "centre" })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return webpBuffer.toString("base64");
}
