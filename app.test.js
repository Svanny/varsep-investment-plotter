
// Investment Calculator Test Suite
// Run with: node app.test.js

const {
    CONFIG,
    normalizeInvestmentParams,
    runInvestmentCalculation
} = require('./app.js');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assertEqual(actual, expected, testName, tolerance = 0.01) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        console.log(`✓ PASS: ${testName}`);
        testsPassed++;
    } else {
        console.log(`✗ FAIL: ${testName}`);
        console.log(`  Expected: ${expected}`);
        console.log(`  Actual:   ${actual}`);
        console.log(`  Diff:     ${diff}`);
        testsFailed++;
    }
}

function assertNull(actual, testName) {
    if (actual === null) {
        console.log(`✓ PASS: ${testName}`);
        testsPassed++;
    } else {
        console.log(`✗ FAIL: ${testName}`);
        console.log(`  Expected: null`);
        console.log(`  Actual:   ${actual}`);
        testsFailed++;
    }
}

function assertNotNull(actual, testName) {
    if (actual !== null) {
        console.log(`✓ PASS: ${testName}`);
        testsPassed++;
    } else {
        console.log(`✗ FAIL: ${testName}`);
        console.log(`  Expected: not null`);
        console.log(`  Actual:   null`);
        testsFailed++;
    }
}

// ============================================
// TEST CASES
// ============================================

console.log('\n========================================');
console.log('Investment Calculator Test Suite');
console.log('========================================\n');

// Test 0: Input normalization preserves valid zero values
console.log('--- Test 0: Input Normalization ---');
{
    const normalized = normalizeInvestmentParams({
        initialInvestment: '0',
        years: '10',
        annualGrowthRate: '0',
        performanceFee: '0',
        inflationRate: '0',
        taxRate: '0',
        contributionFrequency: '12',
        contributionAmount: '0',
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: '0'
    });

    assertEqual(normalized.initialInvestment, 0, 'Zero initial investment is preserved');
    assertEqual(normalized.annualGrowthRate, 0, 'Zero growth rate is preserved');
}

// Test 0b: Scenario-style invalid values are bounded before calculation
console.log('\n--- Test 0b: Scenario Bounds Normalization ---');
{
    const normalized = normalizeInvestmentParams({
        initialInvestment: '-100',
        years: '1000',
        annualGrowthRate: '-3',
        performanceFee: '99',
        inflationRate: '-2',
        taxRate: '900',
        contributionFrequency: '999',
        contributionAmount: '999999999',
        compounding: true,
        withdrawalMode: 'javascript:alert(1)',
        withdrawalValue: '-25'
    });

    assertEqual(normalized.initialInvestment, CONFIG.INITIAL_INVESTMENT.MIN, 'Initial investment is clamped to minimum');
    assertEqual(normalized.years, CONFIG.YEARS.MAX, 'Years are clamped to maximum');
    assertEqual(normalized.annualGrowthRate, CONFIG.GROWTH_RATE.MIN, 'Growth rate is clamped to minimum');
    assertEqual(normalized.performanceFee, CONFIG.PERFORMANCE_FEE.MAX, 'Performance fee is clamped to maximum');
    assertEqual(normalized.inflationRate, CONFIG.INFLATION_RATE.MIN, 'Inflation rate is clamped to minimum');
    assertEqual(normalized.taxRate, CONFIG.TAX_RATE.MAX, 'Tax rate is clamped to maximum');
    assertEqual(normalized.contributionFrequency, CONFIG.FREQUENCY.MONTHLY, 'Invalid contribution frequency falls back to monthly');
    assertEqual(normalized.contributionAmount, CONFIG.CONTRIBUTION_AMOUNT.MAX, 'Contribution amount is clamped to maximum');
    assertEqual(normalized.withdrawalValue, CONFIG.WITHDRAWAL_VALUE.MIN, 'Withdrawal value is clamped to minimum');
    assertEqual(normalized.withdrawalMode === 'none' ? 1 : 0, 1, 'Invalid withdrawal mode falls back to none');
}

// Test 1: Basic investment with no contributions or withdrawals
console.log('\n--- Test 1: Simple Growth (No Contributions) ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 1,
        annualGrowthRate: 10,
        performanceFee: 0,
        contributionFrequency: 1, // Annually
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    // $10,000 * 1.10 = $11,000
    assertEqual(result.finalBalance, 11000, 'Final balance after 1 year at 10% growth');
    assertEqual(result.totalInterest, 1000, 'Total interest earned');
    assertEqual(result.totalFees, 0, 'No fees charged');
    assertEqual(result.totalContributions, 0, 'No contributions');
    assertNull(result.depletionYear, 'No depletion');
}

// Test 2: Investment with monthly contributions
console.log('\n--- Test 2: Monthly Contributions ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 1,
        annualGrowthRate: 0, // No growth to simplify
        performanceFee: 0,
        contributionFrequency: 12, // Monthly
        contributionAmount: 100,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    // $10,000 + (12 * $100) = $11,200
    assertEqual(result.finalBalance, 11200, 'Final balance with monthly contributions');
    assertEqual(result.totalContributions, 1200, 'Total contributions (12 x $100)');
}

// Test 3: Performance fee deduction
console.log('\n--- Test 3: Performance Fee ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 1,
        annualGrowthRate: 0,
        performanceFee: 1, // 1% annual fee
        contributionFrequency: 1,
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    // $10,000 - 1% = $9,900
    assertEqual(result.finalBalance, 9900, 'Final balance after 1% fee');
    assertEqual(result.totalFees, 100, 'Total fees (1% of $10,000)');
}

// Test 4: Compounding vs non-compounding
console.log('\n--- Test 4: Compounding vs Non-Compounding ---');
{
    const compoundResult = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 2,
        annualGrowthRate: 10,
        performanceFee: 0,
        contributionFrequency: 1,
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    const nonCompoundResult = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 2,
        annualGrowthRate: 10,
        performanceFee: 0,
        contributionFrequency: 1,
        contributionAmount: 0,
        compounding: false,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    // Compounding: $10,000 * 1.10 * 1.10 = $12,100
    assertEqual(compoundResult.finalBalance, 12100, 'Compounding: $10k at 10% for 2 years');

    // Non-compounding: balance stays at $10,000 (interest not added to balance)
    assertEqual(nonCompoundResult.finalBalance, 10000, 'Non-compounding: balance unchanged');
    assertEqual(nonCompoundResult.totalInterest, 1906.45, 'Non-compounding: daily CAGR interest still calculated');
}

// Test 5: Fixed amount withdrawal
console.log('\n--- Test 5: Fixed Amount Withdrawal ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 1,
        annualGrowthRate: 0,
        performanceFee: 0,
        contributionFrequency: 12,
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'fixed_amount',
        withdrawalValue: 500 // $500/month
    });

    // $10,000 - (12 * $500) = $4,000
    assertEqual(result.finalBalance, 4000, 'Final balance after $500/month withdrawal');
    assertEqual(result.totalWithdrawals, 6000, 'Total withdrawals (12 x $500)');
}

// Test 6: Percentage withdrawal
console.log('\n--- Test 6: Percentage Withdrawal ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 1,
        annualGrowthRate: 0,
        performanceFee: 0,
        contributionFrequency: 1,
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'percentage',
        withdrawalValue: 10 // 10%
    });

    // $10,000 - 10% = $9,000
    assertEqual(result.finalBalance, 9000, 'Final balance after 10% withdrawal');
    assertEqual(result.totalWithdrawals, 1000, 'Total withdrawals (10% of $10,000)');
}

// Test 7: Balance depletion scenario
console.log('\n--- Test 7: Balance Depletion ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 5000,
        years: 10,
        annualGrowthRate: 0,
        performanceFee: 0,
        contributionFrequency: 1,
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'fixed_amount',
        withdrawalValue: 1000 // $1000/year
    });

    // $5,000 / $1,000 = 5 years until depletion
    assertEqual(result.finalBalance, 0, 'Balance depleted to zero');
    assertNotNull(result.depletionYear, 'Depletion year is set');
    assertEqual(result.depletionYear, 5, 'Balance depletes in year 5');
}

// Test 8: Daily CAGR growth is independent of contribution frequency
console.log('\n--- Test 8: Daily CAGR Ignores Zero-Contribution Frequency ---');
{
    const annualResult = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 1,
        annualGrowthRate: 8,
        performanceFee: 0,
        contributionFrequency: 1,
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    const monthlyResult = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 1,
        annualGrowthRate: 8,
        performanceFee: 0,
        contributionFrequency: 12,
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    // 8% is treated as standard CAGR, then converted to a daily rate:
    // $10,000 * 1.08 = $10,800 regardless of contribution cadence.
    assertEqual(annualResult.finalBalance, 10800, 'Annual contribution frequency uses CAGR result', 0.1);
    assertEqual(monthlyResult.finalBalance, 10800, 'Monthly contribution frequency uses same CAGR result', 0.1);
    assertEqual(annualResult.finalBalance, monthlyResult.finalBalance, 'Zero-contribution final balances match across frequencies');
}

// Test 9: Combined scenario - growth, fees, contributions, withdrawals
console.log('\n--- Test 9: Combined Scenario ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 50000,
        years: 5,
        annualGrowthRate: 8,
        performanceFee: 1,
        contributionFrequency: 12,
        contributionAmount: 500,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    // Verify structure
    assertEqual(result.yearlyResults.length, 5, 'Should have 5 yearly results');
    assertEqual(result.totalContributions, 30000, 'Total contributions (5 years x 12 months x $500)');

    // Final balance should be higher than initial + contributions due to growth
    const minExpected = 50000 + 30000; // At minimum with fees
    if (result.finalBalance > minExpected) {
        console.log(`✓ PASS: Final balance ($${result.finalBalance.toFixed(2)}) exceeds minimum expected ($${minExpected})`);
        testsPassed++;
    } else {
        console.log(`✗ FAIL: Final balance should exceed $${minExpected}`);
        testsFailed++;
    }
}

// Test 10: Edge case - zero initial investment
console.log('\n--- Test 10: Zero Initial Investment ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 0,
        years: 1,
        annualGrowthRate: 10,
        performanceFee: 0,
        contributionFrequency: 12,
        contributionAmount: 1000,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    // Should still accumulate from contributions
    assertEqual(result.totalContributions, 12000, 'Contributions with zero initial');
    // Final balance should be close to contributions plus some interest
    if (result.finalBalance >= 12000) {
        console.log(`✓ PASS: Balance ($${result.finalBalance.toFixed(2)}) grows from contributions alone`);
        testsPassed++;
    } else {
        console.log(`✗ FAIL: Balance should be at least $12,000`);
        testsFailed++;
    }
}

// Test 11: Long-term investment (30 years)
console.log('\n--- Test 11: Long-Term Investment (30 Years) ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 10000,
        years: 30,
        annualGrowthRate: 7,
        performanceFee: 0.5,
        contributionFrequency: 12,
        contributionAmount: 200,
        compounding: true,
        withdrawalMode: 'none',
        withdrawalValue: 0
    });

    assertEqual(result.yearlyResults.length, 30, 'Should have 30 yearly results');
    assertEqual(result.totalContributions, 72000, 'Total contributions over 30 years');

    // With 7% growth and regular contributions, final balance should be substantial
    if (result.finalBalance > 200000) {
        console.log(`✓ PASS: Long-term growth achieved ($${result.finalBalance.toFixed(2)})`);
        testsPassed++;
    } else {
        console.log(`✗ FAIL: Expected significant long-term growth`);
        testsFailed++;
    }
}

// Test 12: Withdrawal exceeds balance protection
console.log('\n--- Test 12: Withdrawal Protection ---');
{
    const result = runInvestmentCalculation({
        initialInvestment: 1000,
        years: 1,
        annualGrowthRate: 0,
        performanceFee: 0,
        contributionFrequency: 1,
        contributionAmount: 0,
        compounding: true,
        withdrawalMode: 'fixed_amount',
        withdrawalValue: 5000 // More than balance
    });

    // Withdrawal should be limited to available balance
    assertEqual(result.finalBalance, 0, 'Balance should not go negative');
    assertEqual(result.totalWithdrawals, 1000, 'Withdrawal limited to available balance');
}

// ============================================
// TEST SUMMARY
// ============================================
console.log('\n========================================');
console.log('TEST SUMMARY');
console.log('========================================');
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`Passed:      ${testsPassed}`);
console.log(`Failed:      ${testsFailed}`);
console.log('========================================\n');

if (testsFailed === 0) {
    console.log('All tests passed! ✓\n');
    process.exit(0);
} else {
    console.log(`${testsFailed} test(s) failed.\n`);
    process.exit(1);
}
