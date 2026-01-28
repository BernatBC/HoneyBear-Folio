/**
 * FIRE Calculator utility functions
 * Monte Carlo simulation and projection calculations
 */

/**
 * Generate a random number from a normal distribution using Box-Muller transform
 * @param {number} mean - Mean of the distribution
 * @param {number} stdDev - Standard deviation
 * @returns {number} Random number from normal distribution
 */
function randomNormal(mean, stdDev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Run a single Monte Carlo simulation
 * @param {Object} params - Simulation parameters
 * @returns {Object} - { success: boolean, finalBalance: number, balances: number[] }
 */
function runSingleSimulation({
  currentNetWorth,
  annualSavings,
  annualExpenses,
  realReturn,
  volatility,
  yearsToRetirement,
  retirementDuration,
  inflationRate,
}) {
  const balances = [currentNetWorth];
  let balance = currentNetWorth;

  // Accumulation phase (until retirement)
  for (let year = 1; year <= yearsToRetirement; year++) {
    // Random return for this year
    const yearReturn = randomNormal(realReturn, volatility) / 100;
    balance = balance * (1 + yearReturn) + annualSavings;
    balances.push(balance);
  }

  // Retirement phase (withdrawal period)
  // Expenses grow with inflation during retirement
  let retirementExpenses = annualExpenses;
  for (let year = 1; year <= retirementDuration; year++) {
    // Random return for this year
    const yearReturn = randomNormal(realReturn, volatility) / 100;
    balance = balance * (1 + yearReturn) - retirementExpenses;
    // Expenses increase with inflation each year
    retirementExpenses *= 1 + inflationRate / 100;
    balances.push(balance);

    // If balance goes negative, simulation failed
    if (balance <= 0) {
      return { success: false, finalBalance: 0, balances };
    }
  }

  return { success: true, finalBalance: balance, balances };
}

/**
 * Run Monte Carlo simulation for FIRE projections
 * @param {Object} params - Simulation parameters
 * @param {number} params.currentNetWorth - Current portfolio value
 * @param {number} params.annualSavings - Annual savings during accumulation
 * @param {number} params.annualExpenses - Annual expenses (in today's dollars)
 * @param {number} params.expectedReturn - Expected nominal return (%)
 * @param {number} params.inflation - Expected inflation rate (%)
 * @param {number} params.volatility - Return standard deviation (%)
 * @param {number} params.currentAge - Current age
 * @param {number} params.retirementAge - Target retirement age
 * @param {number} params.retirementDuration - Years in retirement
 * @param {number} params.simulationCount - Number of simulations to run
 * @returns {Object} - { successRate, percentiles, medianProjection }
 */
export function runMonteCarloSimulation({
  currentNetWorth,
  annualSavings,
  annualExpenses,
  expectedReturn,
  inflation,
  volatility,
  currentAge,
  retirementAge,
  retirementDuration,
  simulationCount = 1000,
}) {
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const totalYears = yearsToRetirement + retirementDuration;

  // Real return = nominal return - inflation (simplified Fisher equation)
  const realReturn = expectedReturn - inflation;

  const results = [];

  for (let i = 0; i < simulationCount; i++) {
    const result = runSingleSimulation({
      currentNetWorth,
      annualSavings,
      annualExpenses,
      realReturn,
      volatility,
      yearsToRetirement,
      retirementDuration,
      inflationRate: inflation,
    });
    results.push(result);
  }

  // Calculate success rate
  const successCount = results.filter((r) => r.success).length;
  const successRate = (successCount / simulationCount) * 100;

  // Calculate percentiles for each year
  const percentiles = {
    p10: [],
    p25: [],
    p50: [],
    p75: [],
    p90: [],
  };

  for (let year = 0; year <= totalYears; year++) {
    const balancesAtYear = results
      .map((r) => r.balances[year] ?? 0)
      .sort((a, b) => a - b);

    const getPercentile = (arr, p) => {
      const index = Math.floor((p / 100) * arr.length);
      return arr[Math.min(index, arr.length - 1)];
    };

    percentiles.p10.push(getPercentile(balancesAtYear, 10));
    percentiles.p25.push(getPercentile(balancesAtYear, 25));
    percentiles.p50.push(getPercentile(balancesAtYear, 50));
    percentiles.p75.push(getPercentile(balancesAtYear, 75));
    percentiles.p90.push(getPercentile(balancesAtYear, 90));
  }

  return {
    successRate,
    percentiles,
    yearsToRetirement,
    totalYears,
    simulationCount,
  };
}

/**
 * Calculate deterministic FIRE projection (no randomness)
 * @param {Object} params - Projection parameters
 * @returns {Object} - { fireNumber, yearsToFire, projectionData }
 */
export function calculateDeterministicProjection({
  currentNetWorth,
  annualSavings,
  annualExpenses,
  expectedReturn,
  inflation,
  withdrawalRate,
  maxYears = 50,
}) {
  // FIRE number based on inflation-adjusted expenses
  // The FIRE number should support expenses that grow with inflation
  // Compute the *real* withdrawal rate using the Fisher equation:
  // real_rate = (1 + nominal_rate) / (1 + inflation_rate) - 1
  const realWithdrawalRateDecimal =
    (1 + withdrawalRate / 100) / (1 + inflation / 100) - 1;

  // If the real withdrawal rate is zero or negative, the FIRE number is effectively unreachable
  // (would require an infinite portfolio to sustainably withdraw today's expenses).
  let fireNumber;
  if (realWithdrawalRateDecimal <= 0) {
    fireNumber = Infinity;
  } else {
    // Round the FIRE number to avoid floating point noise and present a clean integer
    fireNumber = Math.round(annualExpenses / realWithdrawalRateDecimal);
  }

  // Real return for projections
  const realReturn = (expectedReturn - inflation) / 100;

  let balance = currentNetWorth;
  const projectionData = [balance];
  let yearsToFire = null;

  for (let year = 1; year <= maxYears; year++) {
    const returns = balance * realReturn;
    balance = balance + returns + annualSavings;
    projectionData.push(balance);

    if (balance >= fireNumber && yearsToFire === null) {
      yearsToFire = year;
    }
  }

  return {
    fireNumber,
    yearsToFire,
    projectionData,
    neverReached: yearsToFire === null,
  };
}
