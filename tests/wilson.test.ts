import { describe, it, expect } from "vitest";
import { wilsonScoreInterval } from "../eval/run";

describe("Wilson Score Interval Consistency", () => {
  it("computes 0 of 25 -> [0.0%, 13.3%]", () => {
    const ci = wilsonScoreInterval(0, 25);
    expect(ci.value).toBe(0.0);
    expect(ci.ciLower).toBe(0.0);
    expect(ci.ciUpper).toBe(13.3);
  });

  it("computes 3 of 35 -> [3.0%, 22.4%]", () => {
    const ci = wilsonScoreInterval(3, 35);
    expect(ci.value).toBe(8.6);
    expect(ci.ciLower).toBe(3.0);
    expect(ci.ciUpper).toBe(22.4);
  });

  it("computes 9 of 25 -> [20.2%, 55.5%]", () => {
    const ci = wilsonScoreInterval(9, 25);
    expect(ci.value).toBe(36.0);
    expect(ci.ciLower).toBe(20.2);
    expect(ci.ciUpper).toBe(55.5);
  });

  it("computes 14 of 35 -> [25.6%, 56.4%]", () => {
    const ci = wilsonScoreInterval(14, 35);
    expect(ci.value).toBe(40.0);
    expect(ci.ciLower).toBe(25.6);
    expect(ci.ciUpper).toBe(56.4);
  });

  it("computes 25 of 35 -> [54.9%, 83.7%]", () => {
    const ci = wilsonScoreInterval(25, 35);
    expect(ci.value).toBe(71.4);
    expect(ci.ciLower).toBe(54.9);
    expect(ci.ciUpper).toBe(83.7);
  });

  it("computes 35 of 35 -> [90.1%, 100.0%]", () => {
    const ci = wilsonScoreInterval(35, 35);
    expect(ci.value).toBe(100.0);
    expect(ci.ciLower).toBe(90.1);
    expect(ci.ciUpper).toBe(100.0);
  });

  it("computes 0 of 35 -> [0.0%, 9.9%]", () => {
    const ci = wilsonScoreInterval(0, 35);
    expect(ci.value).toBe(0.0);
    expect(ci.ciLower).toBe(0.0);
    expect(ci.ciUpper).toBe(9.9);
  });

  it("computes 1 of 35 -> [0.5%, 14.5%]", () => {
    const ci = wilsonScoreInterval(1, 35);
    expect(ci.value).toBe(2.9);
    expect(ci.ciLower).toBe(0.5);
    expect(ci.ciUpper).toBe(14.5);
  });
});


