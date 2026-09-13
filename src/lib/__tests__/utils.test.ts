import { describe, it, expect } from "vitest";
import { stripAccents } from "../utils";

describe("stripAccents", () => {
  it("strips a single accented character", () => {
    expect(stripAccents("André")).toBe("Andre");
  });

  it("strips accents across a full name, case preserved", () => {
    expect(stripAccents("Müller")).toBe("Muller");
    expect(stripAccents("François")).toBe("Francois");
  });

  it("leaves plain ASCII text untouched", () => {
    expect(stripAccents("Erling Haaland")).toBe("Erling Haaland");
  });

  it("preserves the original string length for real Latin names (real-world assumption the search-highlight index math relies on)", () => {
    const original = "José";
    expect(stripAccents(original).length).toBe(original.length);
  });

  it("handles an empty string without throwing", () => {
    expect(stripAccents("")).toBe("");
  });
});
