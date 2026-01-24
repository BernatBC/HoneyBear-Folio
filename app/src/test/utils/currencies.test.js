import { describe, it, expect } from "vitest";
import { CURRENCIES } from "../../utils/currencies";

describe("CURRENCIES", () => {
  it("should be an array", () => {
    expect(Array.isArray(CURRENCIES)).toBe(true);
  });

  it("should contain valid currency objects", () => {
    CURRENCIES.forEach((currency) => {
      expect(currency).toHaveProperty("code");
      expect(currency).toHaveProperty("name");
      expect(currency).toHaveProperty("symbol");
      expect(currency).toHaveProperty("position");
      expect(["left", "right"]).toContain(currency.position);
    });
  });

  it("should contain common currencies like USD and EUR", () => {
    const usd = CURRENCIES.find((c) => c.code === "USD");
    expect(usd).toBeDefined();
    expect(usd.symbol).toBe("$");
    expect(usd.position).toBe("left");

    const eur = CURRENCIES.find((c) => c.code === "EUR");
    expect(eur).toBeDefined();
    expect(eur.symbol).toBe("€");
    expect(eur.position).toBe("right");
  });
});
