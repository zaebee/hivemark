import { describe, expect, it } from "vitest";
import { avatarSvg } from "../src/avatar.js";

const ID_A = `0x${"ab".repeat(32)}` as const;
const ID_B = `0x${"cd".repeat(32)}` as const;

describe("avatarSvg", () => {
  it("is deterministic", () => {
    expect(avatarSvg(ID_A)).toBe(avatarSvg(ID_A));
  });

  it("differs for different identities", () => {
    expect(avatarSvg(ID_A)).not.toBe(avatarSvg(ID_B));
  });

  it("emits a self-contained svg with no external references", () => {
    const svg = avatarSvg(ID_A);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    // The xmlns declaration is an identifier, not a fetch, so "no http" is the
    // wrong assertion. What must be absent is anything that loads: references,
    // embedded images, scripts.
    expect(svg).not.toMatch(/href=/i);
    expect(svg).not.toMatch(/url\(/i);
    expect(svg).not.toMatch(/<image|<script|<foreignObject/i);
  });

  it("is horizontally mirrored, so a face reads as a face", () => {
    const cells = [...avatarSvg(ID_B).matchAll(/data-cell="(\d+),(\d+)"/g)].map(
      ([, col, row]) => `${col},${row}`,
    );
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const [col, row] = cell.split(",").map(Number) as [number, number];
      expect(cells).toContain(`${4 - col},${row}`);
    }
  });
});
