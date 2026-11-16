import { describe, expect, it } from "vitest";

import {
  A4_COLUMNS,
  classifyRows,
  columnCapacityRows,
  layoutSlip,
  mmPerRow,
  RowKind,
} from "@/daily-briefing/admin/a4Layout";

const WIDTH = 10;

/** One character per raster row: `.` empty, `#` full-width band, `t` a line of text. */
function raster(rows: string): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(rows.length * WIDTH * 4).fill(255);
  [...rows].forEach((row, y) => {
    const dark = row === "#" ? WIDTH : row === "t" ? 3 : 0;
    for (let x = 0; x < dark; x += 1) pixels.fill(0, (y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 3);
  });
  return pixels;
}

function kindsOf(rows: string): number[] {
  return [...classifyRows(raster(rows), WIDTH, rows.length)];
}

describe("classifyRows", () => {
  it("marks the middle of the gap above a header band, and empty rows inside a block", () => {
    //            0123456789
    const rows = "#t.t....#t";
    expect(kindsOf(rows)).toEqual([
      RowKind.Ink,
      RowKind.Ink,
      RowKind.Blank,
      RowKind.Ink,
      RowKind.Blank,
      RowKind.Blank,
      RowKind.BlockGap,
      RowKind.Blank,
      RowKind.Ink,
      RowKind.Ink,
    ]);
  });

  it("does not start a block at a band that continues a header (no empty row above it)", () => {
    expect(kindsOf("..#t#")).toEqual([
      RowKind.Blank,
      RowKind.BlockGap,
      RowKind.Ink,
      RowKind.Ink,
      RowKind.Ink,
    ]);
  });

  it("treats transparent pixels as paper", () => {
    const pixels = new Uint8ClampedArray(WIDTH * 4); // black, fully transparent
    expect([...classifyRows(pixels, WIDTH, 1)]).toEqual([RowKind.Blank]);
  });
});

describe("layoutSlip", () => {
  it("keeps a slip that fits in one column whole", () => {
    expect(layoutSlip(classifyRows(raster("#t.t"), WIDTH, 4), 10)).toEqual([
      [{ top: 0, height: 4 }],
    ]);
  });

  it("ends each column at the last block gap that fits", () => {
    // Blocks start at rows 0, 6 and 12; the gaps sit at rows 5 and 11.
    const rows = "#tttt.#tttt.#tttt";
    const pages = layoutSlip(classifyRows(raster(rows), WIDTH, rows.length), 8);
    // Two columns to a page, so the third starts the next page.
    expect(pages).toEqual([
      [
        { top: 0, height: 5 },
        { top: 5, height: 6 },
      ],
      [{ top: 11, height: 6 }],
    ]);
  });

  it("cuts a block taller than a column at its last empty row, else mid-content", () => {
    const withBlank = "#ttt.ttttt";
    expect(layoutSlip(classifyRows(raster(withBlank), WIDTH, withBlank.length), 6)).toEqual([
      [
        { top: 0, height: 4 },
        { top: 4, height: 6 },
      ],
    ]);
    const solid = "#ttttttttt";
    expect(layoutSlip(classifyRows(raster(solid), WIDTH, solid.length), 6)).toEqual([
      [
        { top: 0, height: 6 },
        { top: 6, height: 4 },
      ],
    ]);
  });

  it("starts a new page after the last column of a page", () => {
    const rows = ".#t".repeat(A4_COLUMNS + 1);
    const pages = layoutSlip(classifyRows(raster(rows), WIDTH, rows.length), 3);
    expect(pages.map((page) => page.length)).toEqual([A4_COLUMNS, 1]);
    expect(pages.flat().reduce((sum, segment) => sum + segment.height, 0)).toBe(rows.length);
  });
});

describe("A4 scale", () => {
  it("fits the 576-dot slip two columns to a page, larger than on the thermal paper", () => {
    expect(mmPerRow(576) * 576).toBeCloseTo(90);
    // 275 mm of column at 90 mm per 576 rows.
    expect(columnCapacityRows(576)).toBe(1760);
  });
});
