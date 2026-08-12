import { describe, expect, it } from "vitest";
import { periodOf, periodBounds, periodsBetween } from "../src/anchor/period.js";

describe("periodOf", () => {
  it("buckets a timestamp into its ISO week", () => {
    expect(periodOf("2026-08-12T11:27:57+00:00")).toBe("2026-W33");
  });

  it("puts Monday and the following Sunday in the same week", () => {
    expect(periodOf("2026-08-10T00:00:00Z")).toBe(periodOf("2026-08-16T23:59:59Z"));
  });

  it("starts a new week on Monday, not Sunday", () => {
    expect(periodOf("2026-08-16T23:59:59Z")).not.toBe(periodOf("2026-08-17T00:00:00Z"));
  });

  it("handles a year boundary the ISO way, where week 1 holds the first Thursday", () => {
    // 2027-01-01 is a Friday, so it belongs to the week that began 2026-12-28.
    expect(periodOf("2027-01-01T12:00:00Z")).toBe("2026-W53");
  });

  it("refuses a timestamp it cannot parse rather than bucketing it somewhere", () => {
    expect(() => periodOf("whenever")).toThrow(/unparseable/i);
  });
});

describe("periodBounds", () => {
  it("returns a half-open range covering exactly seven days", () => {
    const { start, end } = periodBounds("2026-W33");
    expect(end - start).toBe(7 * 24 * 60 * 60);
  });

  it("round-trips with periodOf at both edges", () => {
    const { start, end } = periodBounds("2026-W33");
    expect(periodOf(new Date(start * 1000).toISOString())).toBe("2026-W33");
    expect(periodOf(new Date((end - 1) * 1000).toISOString())).toBe("2026-W33");
    expect(periodOf(new Date(end * 1000).toISOString())).not.toBe("2026-W33");
  });
});

describe("periodsBetween", () => {
  it("lists every week inclusive, so a gap has a name", () => {
    expect(periodsBetween("2026-W33", "2026-W36")).toEqual([
      "2026-W33",
      "2026-W34",
      "2026-W35",
      "2026-W36",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(periodsBetween("2026-W52", "2027-W01")).toEqual(["2026-W52", "2026-W53", "2027-W01"]);
  });

  it("returns a single period when from equals to", () => {
    expect(periodsBetween("2026-W33", "2026-W33")).toEqual(["2026-W33"]);
  });
});
