/** The decoded slip raster: RGBA rows, top to bottom. */
export interface SlipPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Decodes the stored slip PNG through a canvas. Kept apart from the layout so tests can stand
 * in for it: jsdom has no canvas. */
export async function readSlipPixels(png: Blob): Promise<SlipPixels> {
  const bitmap = await createImageBitmap(png);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas 2d context unavailable");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data };
  } finally {
    bitmap.close();
  }
}
