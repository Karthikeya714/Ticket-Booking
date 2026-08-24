import { describe, it, expect } from "vitest";
import { generateBookingQrPng } from "./qr";

describe("generateBookingQrPng", () => {
  it("produces a real PNG buffer, not a placeholder", async () => {
    const png = await generateBookingQrPng("BK-ABC123DEF456");

    // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.length).toBeGreaterThan(100);
  });

  it("encodes different references to different images", async () => {
    const a = await generateBookingQrPng("BK-AAAAAAAAAAAA");
    const b = await generateBookingQrPng("BK-BBBBBBBBBBBB");
    expect(Buffer.compare(a, b)).not.toBe(0);
  });
});
