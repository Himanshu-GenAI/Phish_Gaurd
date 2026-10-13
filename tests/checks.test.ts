import { describe, it, expect, vi, afterEach } from "vitest";
import { extractUrls, extractUpiHandles, extractAmounts } from "@/lib/checks/entities";
import { checkDomain } from "@/lib/checks/rdap";

describe("Live Infrastructure & Entity Checks (lib/checks)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Entity Extraction (entities.ts)", () => {
    it("extracts and deduplicates HTTP and HTTPS URLs", () => {
      const text = "Visit http://example.test/login and https://verify.test and http://example.test/login";
      const urls = extractUrls(text);
      expect(urls).toEqual(["http://example.test/login", "https://verify.test"]);
    });

    it("extracts and deduplicates recognized Indian UPI handles", () => {
      const text = "Pay to quickjob@ybl or support@oksbi or quickjob@ybl or admin@paytm";
      const upi = extractUpiHandles(text);
      expect(upi).toEqual(["quickjob@ybl", "support@oksbi", "admin@paytm"]);
    });

    it("extracts and deduplicates INR amounts (Rs and ₹)", () => {
      const text = "Transfer ₹5,000 or Rs 499 or ₹5,000 or Rs. 1200.50";
      const amounts = extractAmounts(text);
      expect(amounts).toContain("₹5,000");
      expect(amounts).toContain("Rs 499");
    });
  });

  describe("RDAP Domain Age Forensics (rdap.ts)", () => {
    it("returns weight 25 for domains registered less than 30 days ago", async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [{ eventAction: "registration", eventDate: tenDaysAgo }],
          }),
          { status: 200 }
        )
      );

      const res = await checkDomain("https://fresh-scam-domain.test/login");
      expect(res).not.toBeNull();
      expect(res?.weight).toBe(25);
      expect(res?.ageDays).toBeLessThan(30);
      expect(res?.note).toContain("Domain registered only");
    });

    it("returns weight 15 for domains registered between 30 and 90 days ago", async () => {
      const fiftyDaysAgo = new Date(Date.now() - 50 * 86_400_000).toISOString();
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [{ eventAction: "registration", eventDate: fiftyDaysAgo }],
          }),
          { status: 200 }
        )
      );

      const res = await checkDomain("https://medium-domain.test");
      expect(res?.weight).toBe(15);
      expect(res?.note).toContain("very new");
    });

    it("returns weight 8 for domains registered between 90 and 365 days ago", async () => {
      const twoHundredDaysAgo = new Date(Date.now() - 200 * 86_400_000).toISOString();
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [{ eventAction: "registration", eventDate: twoHundredDaysAgo }],
          }),
          { status: 200 }
        )
      );

      const res = await checkDomain("https://older-domain.test");
      expect(res?.weight).toBe(8);
    });

    it("returns weight 0 for established domains older than 365 days", async () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 86_400_000).toISOString();
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events: [{ eventAction: "registration", eventDate: twoYearsAgo }],
          }),
          { status: 200 }
        )
      );

      const res = await checkDomain("https://google.test");
      expect(res?.weight).toBe(0);
      expect(res?.note).toContain("established");
    });

    it("returns null gracefully on network failure or invalid response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 }));
      expect(await checkDomain("https://error.test")).toBeNull();

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));
      expect(await checkDomain("https://timeout.test")).toBeNull();
    });
  });
});
