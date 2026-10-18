import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";
import { fillOwnerSlots } from "../eval/fill-owner-slots";
import { sealTestSplit } from "../eval/seal";

describe("Owner Slot Tooling (eval/fill-owner-slots.ts & eval/seal.ts)", () => {
  const tmpDir = resolve(process.cwd(), "eval/tmp_test_slots");
  const tmpTestJson = resolve(tmpDir, "test.json");
  const tmpOwnerJson = resolve(tmpDir, "owner-items.json");
  const tmpShaPath = resolve(tmpDir, "test.sha256");

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    // Create mock test.json with 2 populated items and 10 owner slots
    const mockTest = [
      { id: "test-001", text: "Mock scam", label: "scam", scam_type: "fake_job", language: "en", difficulty: "easy", channel: "sms" },
      { id: "test-002", text: "Mock genuine", label: "genuine", scam_type: "none", language: "en", difficulty: "easy", channel: "sms" },
    ];
    for (let i = 1; i <= 10; i++) {
      mockTest.push({
        id: `test-USER-${String(i).padStart(2, "0")}`,
        text: "",
        label: "genuine",
        scam_type: "none",
        language: "en",
        difficulty: "hard",
        channel: "sms",
      });
    }
    writeFileSync(tmpTestJson, JSON.stringify(mockTest, null, 2), "utf-8");
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("refuses to fill owner slots if test.sha256 already exists", () => {
    writeFileSync(tmpShaPath, "mockhash  test.json\n", "utf-8");
    expect(() =>
      fillOwnerSlots({
        ownerItemsPath: tmpOwnerJson,
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("[REFUSED]");
  });

  it("refuses to fill owner slots if owner items file is missing", () => {
    expect(() =>
      fillOwnerSlots({
        ownerItemsPath: resolve(tmpDir, "nonexistent.json"),
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("[NOT FOUND]");
  });

  it("refuses if owner items array does not contain exactly 10 items", () => {
    writeFileSync(tmpOwnerJson, JSON.stringify([{ text: "only one", language: "en", difficulty: "hard", channel: "sms" }]), "utf-8");
    expect(() =>
      fillOwnerSlots({
        ownerItemsPath: tmpOwnerJson,
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("[INVALID COUNT]");
  });

  it("refuses if any owner item has empty text or invalid metadata", () => {
    const invalidItems = Array.from({ length: 10 }, (_, i) => ({
      text: i === 5 ? "   " : "Valid authentic message",
      label: "genuine",
      scam_type: "none",
      language: "en",
      difficulty: "hard",
      channel: "sms",
    }));
    writeFileSync(tmpOwnerJson, JSON.stringify(invalidItems), "utf-8");
    expect(() =>
      fillOwnerSlots({
        ownerItemsPath: tmpOwnerJson,
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("[VALIDATION ERROR]");
  });

  it("refuses if any owner item is missing explicit label or scam_type", () => {
    const missingLabelItems = Array.from({ length: 10 }, () => ({
      text: "Valid authentic message",
      language: "en",
      difficulty: "hard",
      channel: "sms",
    }));
    writeFileSync(tmpOwnerJson, JSON.stringify(missingLabelItems), "utf-8");
    expect(() =>
      fillOwnerSlots({
        ownerItemsPath: tmpOwnerJson,
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("must carry an explicit label");

    const missingScamTypeItems = Array.from({ length: 10 }, () => ({
      text: "Valid authentic message",
      label: "genuine",
      language: "en",
      difficulty: "hard",
      channel: "sms",
    }));
    writeFileSync(tmpOwnerJson, JSON.stringify(missingScamTypeItems), "utf-8");
    expect(() =>
      fillOwnerSlots({
        ownerItemsPath: tmpOwnerJson,
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("must carry an explicit scam_type");
  });

  it("refuses if owner item has mismatched label and scam_type", () => {
    const mismatchedGenuine = Array.from({ length: 10 }, (_, i) => ({
      text: "Message text",
      label: "genuine",
      scam_type: i === 0 ? "fake_job" : "none",
      language: "en",
      difficulty: "hard",
      channel: "sms",
    }));
    writeFileSync(tmpOwnerJson, JSON.stringify(mismatchedGenuine), "utf-8");
    expect(() =>
      fillOwnerSlots({
        ownerItemsPath: tmpOwnerJson,
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("Genuine items must have scam_type 'none'");

    const mismatchedScam = Array.from({ length: 10 }, (_, i) => ({
      text: "Message text",
      label: "scam",
      scam_type: i === 0 ? "none" : "fake_job",
      language: "en",
      difficulty: "hard",
      channel: "sms",
    }));
    writeFileSync(tmpOwnerJson, JSON.stringify(mismatchedScam), "utf-8");
    expect(() =>
      fillOwnerSlots({
        ownerItemsPath: tmpOwnerJson,
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("Scam items must have a concrete scam_type");
  });

  it("successfully fills owner slots and preserves explicit labels and privacy", () => {
    const validItems = Array.from({ length: 10 }, (_, i) => ({
      text: `Private authentic message number ${i + 1}`,
      label: i < 8 ? "scam" : "genuine",
      scam_type: i < 8 ? "digital_arrest" : "none",
      language: "en",
      difficulty: "hard",
      channel: "sms",
      notes: "Private bank alert",
    }));
    writeFileSync(tmpOwnerJson, JSON.stringify(validItems), "utf-8");

    const res = fillOwnerSlots({
      ownerItemsPath: tmpOwnerJson,
      testJsonPath: tmpTestJson,
      shaPath: tmpShaPath,
    });

    expect(res.filledCount).toBe(10);
    expect(res.updatedIds).toHaveLength(10);
    expect(res.totalTestItems).toBe(12);

    const updatedTest = JSON.parse(require("fs").readFileSync(tmpTestJson, "utf-8"));
    const slot1 = updatedTest.find((it: any) => it.id === "test-USER-01");
    expect(slot1.label).toBe("scam");
    expect(slot1.scam_type).toBe("digital_arrest");

    const slot9 = updatedTest.find((it: any) => it.id === "test-USER-09");
    expect(slot9.label).toBe("genuine");
    expect(slot9.scam_type).toBe("none");
  });

  it("sealTestSplit refuses if any slots still have empty text", () => {
    expect(() =>
      sealTestSplit({
        testJsonPath: tmpTestJson,
        shaPath: tmpShaPath,
      })
    ).toThrow("[SEAL REFUSED]");
  });

  it("sealTestSplit succeeds and computes hash when all slots are populated", () => {
    const validItems = Array.from({ length: 10 }, (_, i) => ({
      text: `Private authentic message number ${i + 1}`,
      label: "genuine",
      scam_type: "none",
      language: "en",
      difficulty: "hard",
      channel: "sms",
    }));
    writeFileSync(tmpOwnerJson, JSON.stringify(validItems), "utf-8");
    fillOwnerSlots({
      ownerItemsPath: tmpOwnerJson,
      testJsonPath: tmpTestJson,
      shaPath: tmpShaPath,
    });

    const sealRes = sealTestSplit({
      testJsonPath: tmpTestJson,
      shaPath: tmpShaPath,
    });

    expect(sealRes.itemCount).toBe(12);
    expect(sealRes.sha256).toHaveLength(64);
    expect(existsSync(tmpShaPath)).toBe(true);
  });
});
