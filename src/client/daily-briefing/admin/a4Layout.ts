// A4 placement of the printed slip. The slip is one narrow raster (576 dots wide, several
// thousand tall), so an A4 sheet shows it as side-by-side columns, cut between blocks. Nothing
// is re-rendered: the sheet shows the stored raster, so paper and thermal slip carry the same
// content.

/** Columns of slip per A4 page. */
export const A4_COLUMNS = 3;
/** Printed width of one column: (210 − 2 × 10 margin − 2 × 5 gap) / 3. */
export const A4_COLUMN_WIDTH_MM = 60;
/** Usable column height. Two millimetres short of 297 − 2 × 10, so rounding in the browser's
 * print layout never pushes a column onto an extra page. */
const A4_COLUMN_HEIGHT_MM = 275;

/** How a column may end on a raster row. */
export const RowKind = {
  /** The row carries ink: a cut here slices through content. */
  Ink: 0,
  /** An empty row inside a block (between lines of text). */
  Blank: 1,
  /** The middle of the empty gap above a block's header band: the preferred place to cut. */
  BlockGap: 2,
} as const;

/** One column's slice of the slip, in raster rows. */
export interface SlipSegment {
  top: number;
  height: number;
}

/** A header band spans (nearly) the full width; body text and grids never do. */
const BAND_DARK_RATIO = 0.9;

/** Classifies every row of an RGBA raster. A block starts where a full-width dark band follows
 * an empty row: the header band's label breaks the band into several dark runs, but only its
 * first run has white above it. */
export function classifyRows(pixels: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const kinds = new Uint8Array(height);
  let blankRun = 0;
  for (let y = 0; y < height; y += 1) {
    let dark = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      // Transparent counts as paper; the raster is black on white.
      if (pixels[i + 3] >= 128 && pixels[i] + pixels[i + 1] + pixels[i + 2] < 384) dark += 1;
    }
    if (dark === 0) {
      kinds[y] = RowKind.Blank;
      blankRun += 1;
      continue;
    }
    if (blankRun > 0 && dark >= width * BAND_DARK_RATIO) {
      kinds[y - Math.ceil(blankRun / 2)] = RowKind.BlockGap;
    }
    blankRun = 0;
  }
  return kinds;
}

/** Rows of slip that fit in one A4 column at the printed scale. */
export function columnCapacityRows(slipWidth: number): number {
  return Math.floor((A4_COLUMN_HEIGHT_MM * slipWidth) / A4_COLUMN_WIDTH_MM);
}

/** Millimetres of paper per raster row (and per raster column: the scale is uniform). */
export function mmPerRow(slipWidth: number): number {
  return A4_COLUMN_WIDTH_MM / slipWidth;
}

/** Fills columns top to bottom, page after page. A column ends at the last block gap that fits;
 * a block taller than a column is cut at its last empty row, or mid-content when it has none. */
export function layoutSlip(kinds: Uint8Array, capacity: number): SlipSegment[][] {
  const height = kinds.length;
  const columns: SlipSegment[] = [];
  let top = 0;
  while (top < height) {
    let end = Math.min(top + capacity, height);
    if (end < height) {
      const limit = end;
      let blank = -1;
      end = -1;
      for (let y = limit; y > top; y -= 1) {
        if (kinds[y] === RowKind.BlockGap) {
          end = y;
          break;
        }
        if (blank < 0 && kinds[y] === RowKind.Blank) blank = y;
      }
      if (end < 0) end = blank > 0 ? blank : limit;
    }
    columns.push({ top, height: end - top });
    top = end;
  }
  const pages: SlipSegment[][] = [];
  for (let i = 0; i < columns.length; i += A4_COLUMNS) {
    pages.push(columns.slice(i, i + A4_COLUMNS));
  }
  return pages;
}
