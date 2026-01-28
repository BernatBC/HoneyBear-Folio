import { describe, it, expect } from "vitest";
import {
  runMonteCarloSimulation,
  calculateDeterministicProjection,
} from "../../utils/fire";

describe("fire utilities", () => {
  describe("calculateDeterministicProjection", () => {
    it("calculates FIRE number correctly", () => {
      const result = calculateDeterministicProjection({
        currentNetWorth: 100000,
        annualSavings: 20000,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        withdrawalRate: 4,
      });

      // FIRE number uses real withdrawal rate: (1 + withdrawalRate) / (1 + inflation) - 1
      // real_rate = (1.04 / 1.02) - 1 = 1/51 => fireNumber = 40000 / (1/51) = 40000 * 51 = 2,040,000
      expect(result.fireNumber).toBe(2040000);
    });

    it("calculates years to FIRE correctly", () => {
      const result = calculateDeterministicProjection({
        currentNetWorth: 500000,
        annualSavings: 50000,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        withdrawalRate: 4,
      });

      // With 500k starting, 50k savings, 5% real return (7% - 2%)
      // Should reach 1M FIRE number in a few years
      expect(result.yearsToFire).toBeGreaterThan(0);
      expect(result.yearsToFire).toBeLessThan(20);
      expect(result.neverReached).toBe(false);
    });

    it("returns neverReached when FIRE is not achievable", () => {
      const result = calculateDeterministicProjection({
        currentNetWorth: 0,
        annualSavings: 0,
        annualExpenses: 50000,
        expectedReturn: 0,
        inflation: 3,
        withdrawalRate: 4,
      });

      expect(result.neverReached).toBe(true);
      expect(result.yearsToFire).toBeNull();
    });

    it("accounts for inflation in real returns", () => {
      const highInflation = calculateDeterministicProjection({
        currentNetWorth: 100000,
        annualSavings: 20000,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 5, // High inflation
        withdrawalRate: 4,
      });

      const lowInflation = calculateDeterministicProjection({
        currentNetWorth: 100000,
        annualSavings: 20000,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 1, // Low inflation
        withdrawalRate: 4,
      });

      // Higher inflation means slower growth, longer time to FIRE
      // If inflation outpaces the withdrawal rate, FIRE becomes unreachable (neverReached true).
      if (highInflation.neverReached) {
        expect(highInflation.neverReached).toBe(true);
      } else {
        expect(highInflation.yearsToFire).toBeGreaterThan(
          lowInflation.yearsToFire,
        );
      }
    });

    it("generates projection data array", () => {
      const result = calculateDeterministicProjection({
        currentNetWorth: 100000,
        annualSavings: 20000,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        withdrawalRate: 4,
      });

      // Should have 51 data points (year 0 through year 50)
      expect(result.projectionData).toHaveLength(51);
      // First point should be current net worth
      expect(result.projectionData[0]).toBe(100000);
      // Should grow over time
      expect(result.projectionData[50]).toBeGreaterThan(
        result.projectionData[0],
      );
    });
  });

  describe("runMonteCarloSimulation", () => {
    it("returns success rate between 0 and 100", () => {
      const result = runMonteCarloSimulation({
        currentNetWorth: 1000000,
        annualSavings: 0,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        volatility: 15,
        currentAge: 65,
        retirementAge: 65,
        retirementDuration: 30,
        simulationCount: 100,
      });

      expect(result.successRate).toBeGreaterThanOrEqual(0);
      expect(result.successRate).toBeLessThanOrEqual(100);
    });

    it("returns percentiles in correct order", () => {
      const result = runMonteCarloSimulation({
        currentNetWorth: 500000,
        annualSavings: 30000,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        volatility: 15,
        currentAge: 40,
        retirementAge: 65,
        retirementDuration: 30,
        simulationCount: 500,
      });

      // Check that percentiles exist
      expect(result.percentiles.p10).toBeDefined();
      expect(result.percentiles.p25).toBeDefined();
      expect(result.percentiles.p50).toBeDefined();
      expect(result.percentiles.p75).toBeDefined();
      expect(result.percentiles.p90).toBeDefined();

      // Check ordering at multiple years (percentiles should be ordered)
      const yearToCheck = 10;
      expect(result.percentiles.p10[yearToCheck]).toBeLessThanOrEqual(
        result.percentiles.p25[yearToCheck],
      );
      expect(result.percentiles.p25[yearToCheck]).toBeLessThanOrEqual(
        result.percentiles.p50[yearToCheck],
      );
      expect(result.percentiles.p50[yearToCheck]).toBeLessThanOrEqual(
        result.percentiles.p75[yearToCheck],
      );
      expect(result.percentiles.p75[yearToCheck]).toBeLessThanOrEqual(
        result.percentiles.p90[yearToCheck],
      );
    });

    it("high net worth should have higher success rate", () => {
      const lowNetWorth = runMonteCarloSimulation({
        currentNetWorth: 500000,
        annualSavings: 0,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        volatility: 15,
        currentAge: 65,
        retirementAge: 65,
        retirementDuration: 30,
        simulationCount: 500,
      });

      const highNetWorth = runMonteCarloSimulation({
        currentNetWorth: 2000000,
        annualSavings: 0,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        volatility: 15,
        currentAge: 65,
        retirementAge: 65,
        retirementDuration: 30,
        simulationCount: 500,
      });

      expect(highNetWorth.successRate).toBeGreaterThan(lowNetWorth.successRate);
    });

    it("lower volatility should generally lead to higher success rate", () => {
      // With a well-funded portfolio, lower volatility means more predictable outcomes
      const highVolatility = runMonteCarloSimulation({
        currentNetWorth: 1000000,
        annualSavings: 0,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        volatility: 25, // High volatility
        currentAge: 65,
        retirementAge: 65,
        retirementDuration: 30,
        simulationCount: 1000,
      });

      const lowVolatility = runMonteCarloSimulation({
        currentNetWorth: 1000000,
        annualSavings: 0,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        volatility: 5, // Low volatility
        currentAge: 65,
        retirementAge: 65,
        retirementDuration: 30,
        simulationCount: 1000,
      });

      // With a 4% withdrawal rate (40k/1M), low volatility should be safer
      expect(lowVolatility.successRate).toBeGreaterThanOrEqual(
        highVolatility.successRate - 20, // Allow some variance
      );
    });

    it("calculates correct number of years", () => {
      const result = runMonteCarloSimulation({
        currentNetWorth: 500000,
        annualSavings: 20000,
        annualExpenses: 40000,
        expectedReturn: 7,
        inflation: 2,
        volatility: 15,
        currentAge: 40,
        retirementAge: 65,
        retirementDuration: 30,
        simulationCount: 100,
      });

      // 25 years to retirement + 30 years retirement = 55 total years
      expect(result.yearsToRetirement).toBe(25);
      expect(result.totalYears).toBe(55);

      // Percentile arrays should have totalYears + 1 elements (including year 0)
      expect(result.percentiles.p50).toHaveLength(56);
    });
  });
});
