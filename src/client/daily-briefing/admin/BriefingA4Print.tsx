import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n";
import { authFetch } from "@/lib/credential";
import { Button } from "@/components/ui/button";
import {
  A4_COLUMN_WIDTH_MM,
  classifyRows,
  columnCapacityRows,
  layoutSlip,
  mmPerRow,
  type SlipSegment,
} from "./a4Layout";
import { readSlipPixels } from "./slipPixels";

interface Sheet {
  url: string;
  /** Millimetres of paper per raster row. */
  scale: number;
  pages: SlipSegment[][];
}

interface BriefingA4PrintProps {
  memberId: string;
  date: string;
  disabled: boolean;
  /** Reports a failure to the workspace's action error; `null` clears it. */
  onError: (message: string | null) => void;
}

/** Prints the stored slip on an ordinary A4 printer through the browser's print dialog: the
 * raster is laid out in columns on a sheet that only exists on paper (globals.css hides it on
 * screen and hides everything else in print). It bypasses the Printing queue, so it records no
 * `printedAt`. */
export function BriefingA4Print({ memberId, date, disabled, onError }: BriefingA4PrintProps) {
  const t = useT();
  const [preparing, setPreparing] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  async function prepare() {
    if (preparing || sheet) return;
    setPreparing(true);
    onError(null);
    try {
      const response = await authFetch(`/api/daily-briefing/${memberId}/${date}/preview.png`, {
        credentials: "include",
      });
      if (response.status !== 200) {
        onError(
          t(
            response.status === 409
              ? "dailyBriefing.admin.printNoRaster"
              : "dailyBriefing.admin.printA4Error"
          )
        );
        return;
      }
      const png = await response.blob();
      const { width, height, data } = await readSlipPixels(png);
      setSheet({
        url: URL.createObjectURL(png),
        scale: mmPerRow(width),
        pages: layoutSlip(classifyRows(data, width, height), columnCapacityRows(width)),
      });
    } catch {
      onError(t("dailyBriefing.admin.printA4Error"));
    } finally {
      setPreparing(false);
    }
  }

  // The dialog opens once every column's image is decoded; closing it (printed or cancelled)
  // removes the sheet.
  useEffect(() => {
    if (!sheet) return;
    let cancelled = false;
    const done = () => setSheet(null);
    window.addEventListener("afterprint", done);
    const images = Array.from(sheetRef.current?.querySelectorAll("img") ?? []);
    void Promise.all(images.map((image) => image.decode?.().catch(() => undefined))).then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", done);
      URL.revokeObjectURL(sheet.url);
    };
  }, [sheet]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-testid="daily-briefing-print-a4"
        disabled={disabled || preparing || sheet !== null}
        onClick={() => void prepare()}
      >
        {preparing ? t("dailyBriefing.admin.printA4Preparing") : t("dailyBriefing.admin.printA4")}
      </Button>
      {sheet &&
        createPortal(
          <div ref={sheetRef} className="briefing-a4-sheet" data-testid="daily-briefing-a4-sheet">
            {sheet.pages.map((page, pageIndex) => (
              <div key={pageIndex} className="briefing-a4-page">
                {page.map((segment) => (
                  <div
                    key={segment.top}
                    className="briefing-a4-column"
                    // eslint-disable-next-line ui-policy/debt -- Each column's slice of the slip is passed as CSS custom properties to the print rules.
                    style={
                      {
                        "--a4-column-width": `${A4_COLUMN_WIDTH_MM}mm`,
                        "--a4-segment-top": `${segment.top * sheet.scale}mm`,
                        "--a4-segment-height": `${segment.height * sheet.scale}mm`,
                      } as CSSProperties
                    }
                  >
                    <img src={sheet.url} alt="" />
                  </div>
                ))}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
