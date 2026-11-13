import { afterEach, describe, expect, it, vi } from "vitest";

import { readSlipPixels } from "@/daily-briefing/admin/slipPixels";

describe("readSlipPixels", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubBitmap() {
    const bitmap = { width: 2, height: 3, close: vi.fn() };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap)
    );
    return bitmap;
  }

  it("draws the PNG on a canvas of its own size and returns its RGBA rows", async () => {
    const bitmap = stubBitmap();
    const data = new Uint8ClampedArray(2 * 3 * 4);
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data })) };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );

    const pixels = await readSlipPixels(new Blob([]));

    expect(pixels).toEqual({ width: 2, height: 3, data });
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 2, 3);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("fails, releasing the bitmap, when the browser gives no 2D context", async () => {
    const bitmap = stubBitmap();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    await expect(readSlipPixels(new Blob([]))).rejects.toThrow("canvas 2d context unavailable");
    expect(bitmap.close).toHaveBeenCalled();
  });
});
