import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BriefingA4Print } from "@/daily-briefing/admin/BriefingA4Print";
import { LanguageProvider } from "@/i18n";

type FetchCall = Parameters<typeof globalThis.fetch>;

const WIDTH = 576;
const HEIGHT = 6000;

// jsdom has no canvas: the decoded raster is a blank slip with a header band every 1000 rows.
vi.mock("@/daily-briefing/admin/slipPixels", () => ({
  readSlipPixels: vi.fn(async () => {
    const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(255);
    for (let y = 500; y < HEIGHT; y += 1000) {
      for (let x = 0; x < WIDTH; x += 1) data.fill(0, (y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 3);
    }
    return { width: WIDTH, height: HEIGHT, data };
  }),
}));

function mockPreview(status: number) {
  const fetchMock = vi.fn(async (...args: FetchCall) => {
    const url = String(args[0]);
    if (url === "/api/settings") {
      return new Response(JSON.stringify({ locale: { timezone: "UTC", language: "en" } }));
    }
    return status === 200
      ? new Response(new Blob([new Uint8Array([137, 80, 78, 71])]), { status })
      : new Response(JSON.stringify({ error: "x", message: "x" }), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderButton(onError = vi.fn(), disabled = false) {
  render(
    <LanguageProvider>
      <BriefingA4Print
        memberId="member-ben"
        date="2026-10-15"
        disabled={disabled}
        onError={onError}
      />
    </LanguageProvider>
  );
  return onError;
}

describe("BriefingA4Print", () => {
  const print = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("print", print);
    URL.createObjectURL = vi.fn(() => "blob:slip");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    print.mockReset();
    vi.unstubAllGlobals();
  });

  it("lays the stored slip out in columns and opens the print dialog", async () => {
    const fetchMock = mockPreview(200);
    renderButton();

    fireEvent.click(screen.getByTestId("daily-briefing-print-a4"));

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/daily-briefing/member-ben/2026-10-15/preview.png",
      expect.anything()
    );
    const sheet = screen.getByTestId("daily-briefing-a4-sheet");
    expect(sheet.parentElement).toBe(document.body);
    // 6000 rows at 1760 per column: each column ends mid-gap above the next band that fits, so
    // six columns of 1000 rows, two to a page.
    expect(sheet.querySelectorAll(".briefing-a4-page")).toHaveLength(3);
    const columns = [...sheet.querySelectorAll<HTMLElement>(".briefing-a4-column")];
    expect(columns).toHaveLength(6);
    expect(columns.map((column) => column.style.getPropertyValue("--a4-column-width"))).toEqual(
      Array(6).fill("90mm")
    );
    const tops = columns.map((column) =>
      parseFloat(column.style.getPropertyValue("--a4-segment-top"))
    );
    expect(tops[0]).toBe(0);
    tops.slice(1).forEach((top, i) => expect(top).toBeCloseTo(((i + 1) * 1000 * 90) / 576));
    const images = [...sheet.querySelectorAll("img")];
    expect(images.map((image) => image.getAttribute("src"))).toEqual(Array(6).fill("blob:slip"));
  });

  it("removes the sheet and frees the image once the dialog closes", async () => {
    mockPreview(200);
    renderButton();
    fireEvent.click(screen.getByTestId("daily-briefing-print-a4"));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(screen.getByTestId("daily-briefing-print-a4")).toBeDisabled();

    fireEvent(window, new Event("afterprint"));

    await waitFor(() => expect(screen.queryByTestId("daily-briefing-a4-sheet")).toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:slip");
    expect(screen.getByTestId("daily-briefing-print-a4")).toBeEnabled();
  });

  it("says a briefing without a stored image cannot be printed", async () => {
    mockPreview(409);
    const onError = renderButton();

    fireEvent.click(screen.getByTestId("daily-briefing-print-a4"));

    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith("This briefing has no printable image.")
    );
    expect(print).not.toHaveBeenCalled();
    expect(screen.queryByTestId("daily-briefing-a4-sheet")).toBeNull();
  });

  it("reports any other failure to load the image", async () => {
    mockPreview(500);
    const onError = renderButton();

    fireEvent.click(screen.getByTestId("daily-briefing-print-a4"));

    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith("Failed to prepare the A4 sheet.")
    );
    expect(print).not.toHaveBeenCalled();
  });

  it("is disabled until the briefing exists", () => {
    mockPreview(200);
    renderButton(vi.fn(), true);
    expect(screen.getByTestId("daily-briefing-print-a4")).toBeDisabled();
  });
});
