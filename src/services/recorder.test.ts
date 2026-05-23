import { describe, expect, it } from "vitest";
import { float32ToInt16 } from "./recorder";

describe("float32ToInt16", () => {
  it("converts the canonical boundary samples", () => {
    const input = new Float32Array([0, 1, -1, 0.5, -0.5]);
    const out = float32ToInt16(input);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0x7fff);
    expect(out[2]).toBe(-0x8000);
    // Int16Array truncates fractional parts toward zero
    expect(out[3]).toBe(Math.trunc(0.5 * 0x7fff));
    expect(out[4]).toBe(Math.trunc(-0.5 * 0x8000));
  });

  it("clamps samples outside the [-1, 1] range", () => {
    const input = new Float32Array([2, -2, 1.5, -1.5]);
    const out = float32ToInt16(input);
    expect(out[0]).toBe(0x7fff);
    expect(out[1]).toBe(-0x8000);
    expect(out[2]).toBe(0x7fff);
    expect(out[3]).toBe(-0x8000);
  });

  it("preserves length", () => {
    const input = new Float32Array(1600);
    expect(float32ToInt16(input).length).toBe(1600);
  });
});
