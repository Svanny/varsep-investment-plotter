// Investment Calculator Application
// With improved validation, formatting, and features

// ============================================
// CONSTANTS
// ============================================
const CONFIG = {
    // Input limits
    INITIAL_INVESTMENT: { MIN: 0, MAX: 10000000, DEFAULT: 10000 },
    YEARS: { MIN: 1, MAX: 100, DEFAULT: 10 },
    GROWTH_RATE: { MIN: 0, MAX: 30, DEFAULT: 8 },
    PERFORMANCE_FEE: { MIN: 0, MAX: 5, DEFAULT: 1 },
    INFLATION_RATE: { MIN: 0, MAX: 10, DEFAULT: 2.5 },
    TAX_RATE: { MIN: 0, MAX: 50, DEFAULT: 0 },
    CONTRIBUTION_AMOUNT: { MIN: 0, MAX: 1000000, DEFAULT: 500 },
    WITHDRAWAL_VALUE: { MIN: 0, MAX: 1000000, DEFAULT: 0 },
    WITHDRAWAL_MODES: {
        NONE: 'none',
        FIXED_AMOUNT: 'fixed_amount',
        PERCENTAGE: 'percentage'
    },
    WITHDRAWAL_MODE_LABELS: {
        none: 'No withdrawals',
        fixed_amount: 'Fixed amount',
        percentage: 'Percentage of balance'
    },
    WITHDRAWAL_MODE_SHORT_LABELS: {
        none: 'None',
        fixed_amount: 'Fixed $',
        percentage: 'Percentage'
    },

    // Contribution frequencies
    FREQUENCY: {
        ANNUALLY: 1,
        SEMI_ANNUALLY: 2,
        QUARTERLY: 4,
        MONTHLY: 12
    },
    FREQUENCY_LABELS: {
        1: 'Annually',
        2: 'Semi-annually',
        4: 'Quarterly',
        12: 'Monthly'
    },
    STEPS: {
        PERCENT: 0.1,
        TAX_RATE: 0.5
    },
    COMPOUNDING_DEFAULT: true,

    // Milestone amounts for chart markers
    MILESTONES: [100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000],

    // Debounce delay in milliseconds
    DEBOUNCE_DELAY: 100,

    // Chart colors - Carbon-inspired categorical palette
    COLORS: {
        PRIMARY: '#0F62FE',
        SECONDARY: '#1192E8',
        TERTIARY: '#42BE65',
        QUATERNARY: '#FF832B',
        ACCENT: '#0F62FE',
        MILESTONE: '#24A148',
        // Dark mode variants
        PRIMARY_DARK: '#78A9FF',
        SECONDARY_DARK: '#33B1FF',
        TERTIARY_DARK: '#42BE65',
        QUATERNARY_DARK: '#FFB784'
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

const DAYS_PER_YEAR = 365;
const ALLOWED_FREQUENCIES = Object.values(CONFIG.FREQUENCY);
const ALLOWED_WITHDRAWAL_MODES = Object.values(CONFIG.WITHDRAWAL_MODES);

function normalizeBoundedNumber(value, config, parser = parseFloat, clamp = true) {
    const parsed = parser(value);
    let normalized = Number.isNaN(parsed) ? config.DEFAULT : parsed;

    if (clamp) {
        normalized = Math.min(config.MAX, Math.max(config.MIN, normalized));
    }

    return normalized;
}

function normalizeInvestmentParams(params, options = {}) {
    const { clamp = true } = options;
    const contributionFrequency = parseInt(params.contributionFrequency);
    const withdrawalMode = ALLOWED_WITHDRAWAL_MODES.includes(params.withdrawalMode)
        ? params.withdrawalMode
        : CONFIG.WITHDRAWAL_MODES.NONE;

    return {
        initialInvestment: normalizeBoundedNumber(
            params.initialInvestment,
            CONFIG.INITIAL_INVESTMENT,
            parseFormattedNumber,
            clamp
        ),
        years: normalizeBoundedNumber(params.years, CONFIG.YEARS, parseInt, clamp),
        annualGrowthRate: normalizeBoundedNumber(params.annualGrowthRate, CONFIG.GROWTH_RATE, parseFloat, clamp),
        performanceFee: normalizeBoundedNumber(params.performanceFee, CONFIG.PERFORMANCE_FEE, parseFloat, clamp),
        inflationRate: normalizeBoundedNumber(params.inflationRate, CONFIG.INFLATION_RATE, parseFloat, clamp),
        taxRate: normalizeBoundedNumber(params.taxRate, CONFIG.TAX_RATE, parseFloat, clamp),
        contributionFrequency: ALLOWED_FREQUENCIES.includes(contributionFrequency)
            ? contributionFrequency
            : CONFIG.FREQUENCY.MONTHLY,
        contributionAmount: normalizeBoundedNumber(
            params.contributionAmount,
            CONFIG.CONTRIBUTION_AMOUNT,
            parseFormattedNumber,
            clamp
        ),
        compounding: Boolean(params.compounding),
        withdrawalMode,
        withdrawalValue: normalizeBoundedNumber(
            params.withdrawalValue,
            CONFIG.WITHDRAWAL_VALUE,
            parseFormattedNumber,
            clamp
        )
    };
}

function renderContributionFrequencyOptions(selectedFrequency) {
    return ALLOWED_FREQUENCIES.map(frequency => `
                            <option value="${frequency}" ${selectedFrequency === frequency ? 'selected' : ''}>${CONFIG.FREQUENCY_LABELS[frequency]}</option>
    `).join('');
}

function renderWithdrawalModeOptions(selectedMode, labels = CONFIG.WITHDRAWAL_MODE_LABELS) {
    return ALLOWED_WITHDRAWAL_MODES.map(mode => `
                            <option value="${mode}" ${selectedMode === mode ? 'selected' : ''}>${labels[mode]}</option>
    `).join('');
}

function annualRateToDailyRate(annualRatePercent) {
    return Math.pow(1 + (annualRatePercent / 100), 1 / DAYS_PER_YEAR) - 1;
}

function annualFeeToDailyRate(annualFeePercent) {
    return 1 - Math.pow(1 - (annualFeePercent / 100), 1 / DAYS_PER_YEAR);
}

function isScheduledPeriodDay(dayOfYear, frequency) {
    const periodsPerYear = Math.max(1, frequency);

    for (let period = 1; period <= periodsPerYear; period++) {
        if (dayOfYear === Math.round((period * DAYS_PER_YEAR) / periodsPerYear)) {
            return true;
        }
    }

    return false;
}

function calculateInvestmentProjection(params) {
    const {
        initialInvestment,
        years,
        annualGrowthRate,
        performanceFee,
        inflationRate,
        taxRate,
        contributionFrequency,
        contributionAmount,
        compounding,
        withdrawalMode,
        withdrawalValue
    } = params;

    const dailyGrowthRate = annualRateToDailyRate(annualGrowthRate);
    const dailyFeeRate = annualFeeToDailyRate(performanceFee);
    const taxRateDecimal = taxRate / 100;
    const inflationRateDecimal = inflationRate / 100;

    let balance = initialInvestment;
    let totalInterest = 0;
    let totalFees = 0;
    let totalTaxes = 0;
    let totalContributions = 0;
    let totalWithdrawals = 0;

    const yearlyResults = [];
    let depletionYear = null;

    for (let year = 1; year <= years; year++) {
        let yearOpeningBalance = balance;
        let yearInterest = 0;
        let yearFees = 0;
        let yearTaxes = 0;
        let yearContributions = 0;
        let yearWithdrawals = 0;

        for (let day = 1; day <= DAYS_PER_YEAR; day++) {
            if (balance <= 0 && contributionAmount <= 0) {
                if (!depletionYear) depletionYear = year;
                break;
            }

            const feeAmount = balance * dailyFeeRate;
            balance -= feeAmount;
            yearFees += feeAmount;
            totalFees += feeAmount;

            const interestAmount = balance * dailyGrowthRate;
            const taxAmount = interestAmount > 0 ? interestAmount * taxRateDecimal : 0;
            const netInterest = interestAmount - taxAmount;

            if (compounding) {
                balance += netInterest;
            }

            yearInterest += interestAmount;
            yearTaxes += taxAmount;
            totalInterest += interestAmount;
            totalTaxes += taxAmount;

            if (isScheduledPeriodDay(day, contributionFrequency)) {
                if (contributionAmount > 0) {
                    balance += contributionAmount;
                    yearContributions += contributionAmount;
                    totalContributions += contributionAmount;
                }

                if (withdrawalMode !== CONFIG.WITHDRAWAL_MODES.NONE && withdrawalValue > 0) {
                    let withdrawalAmount = 0;

                    if (withdrawalMode === CONFIG.WITHDRAWAL_MODES.FIXED_AMOUNT) {
                        withdrawalAmount = Math.min(withdrawalValue, balance);
                    } else if (withdrawalMode === CONFIG.WITHDRAWAL_MODES.PERCENTAGE) {
                        withdrawalAmount = balance * (withdrawalValue / 100);
                    }

                    balance = Math.max(0, balance - withdrawalAmount);
                    yearWithdrawals += withdrawalAmount;
                    totalWithdrawals += withdrawalAmount;
                }
            }
        }

        yearlyResults.push({
            year,
            openingBalance: yearOpeningBalance,
            interestEarned: yearInterest,
            taxesPaid: yearTaxes,
            feesPaid: yearFees,
            contributions: yearContributions,
            withdrawals: yearWithdrawals,
            closingBalance: balance
        });

        if (balance <= 0 && !depletionYear) {
            depletionYear = year;
            break;
        }
    }

    const realValue = balance / Math.pow(1 + inflationRateDecimal, years);

    return {
        yearlyResults,
        finalBalance: balance,
        realValue,
        totalInterest,
        totalTaxes,
        totalFees,
        totalContributions,
        totalWithdrawals,
        depletionYear
    };
}

/**
 * Debounce function to limit execution rate
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Format number with commas for display
 */
function formatNumberWithCommas(value) {
    if (value === '' || value === null || value === undefined) return '';
    const num = parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Parse a formatted number string to a number
 */
function parseFormattedNumber(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return parseFloat(String(value).replace(/,/g, '')) || 0;
}

/**
 * Format currency for display
 */
function formatCurrency(value) {
    if (isNaN(value)) return '$0.00';
    return '$' + Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Format compact currency (for chart labels)
 */
function formatCompactCurrency(value) {
    if (value >= 1000000) {
        return '$' + (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
        return '$' + (value / 1000).toFixed(0) + 'K';
    }
    return '$' + value.toFixed(0);
}

// ============================================
// INVESTMENT CALCULATOR CLASS
// ============================================
class InvestmentCalculator {
    constructor() {
        this.savedTheme = null;
        this.chartsInitialized = false;
        this.validationErrors = {};
        this.comparisonManager = null;

        this.initializeElements();
        this.applyInputConfiguration();
        this.initializeEventListeners();
        this.initializeCurrencyInputs();
        this.loadTheme();
        this.initializeCharts();
        this.initializeTabSystem();
        this.calculate();

        // Initialize comparison manager after main calculator is ready
        this.comparisonManager = new ComparisonManager(this);
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    initializeElements() {
        this.elements = {
            // Theme toggle
            themeToggle: document.getElementById('themeToggle'),

            // Form inputs
            initialInvestment: document.getElementById('initialInvestment'),
            years: document.getElementById('years'),
            yearsSlider: document.getElementById('yearsSlider'),
            growthRate: document.getElementById('growthRate'),
            growthRateSlider: document.getElementById('growthRateSlider'),
            performanceFee: document.getElementById('performanceFee'),
            performanceFeeSlider: document.getElementById('performanceFeeSlider'),
            inflationRate: document.getElementById('inflationRate'),
            inflationRateSlider: document.getElementById('inflationRateSlider'),
            taxRate: document.getElementById('taxRate'),
            taxRateSlider: document.getElementById('taxRateSlider'),
            contributionFrequency: document.getElementById('contributionFrequency'),
            contributionAmount: document.getElementById('contributionAmount'),
            compounding: document.getElementById('compounding'),
            withdrawalMode: document.getElementById('withdrawalMode'),
            withdrawalValue: document.getElementById('withdrawalValue'),
            withdrawalValueGroup: document.getElementById('withdrawalValueGroup'),
            withdrawalPrefix: document.getElementById('withdrawalPrefix'),

            // Error elements
            initialInvestmentError: document.getElementById('initialInvestmentError'),
            yearsError: document.getElementById('yearsError'),
            growthRateError: document.getElementById('growthRateError'),
            performanceFeeError: document.getElementById('performanceFeeError'),
            inflationRateError: document.getElementById('inflationRateError'),
            taxRateError: document.getElementById('taxRateError'),
            contributionAmountError: document.getElementById('contributionAmountError'),
            withdrawalValueError: document.getElementById('withdrawalValueError'),

            // Chart error
            chartError: document.getElementById('chartError'),

            // Summary cards
            finalBalance: document.getElementById('finalBalance'),
            realValue: document.getElementById('realValue'),
            totalInterest: document.getElementById('totalInterest'),
            totalTaxes: document.getElementById('totalTaxes'),
            totalFees: document.getElementById('totalFees'),
            totalContributions: document.getElementById('totalContributions'),
            totalWithdrawals: document.getElementById('totalWithdrawals'),
            depletionCard: document.getElementById('depletionCard'),
            depletionYear: document.getElementById('depletionYear'),

            // Table elements
            tableBody: document.getElementById('tableBody'),
            totalOpeningBalance: document.getElementById('totalOpeningBalance'),
            totalInterestTable: document.getElementById('totalInterestTable'),
            totalTaxesTable: document.getElementById('totalTaxesTable'),
            totalFeesTable: document.getElementById('totalFeesTable'),
            totalContributionsTable: document.getElementById('totalContributionsTable'),
            totalWithdrawalsTable: document.getElementById('totalWithdrawalsTable'),
            totalClosingBalance: document.getElementById('totalClosingBalance')
        };
    }

    applyInputConfiguration() {
        this.configureCurrencyInput(this.elements.initialInvestment, CONFIG.INITIAL_INVESTMENT);
        this.configureSliderPair(this.elements.yearsSlider, this.elements.years, CONFIG.YEARS);
        this.configureSliderPair(this.elements.growthRateSlider, this.elements.growthRate, CONFIG.GROWTH_RATE, CONFIG.STEPS.PERCENT);
        this.configureSliderPair(this.elements.performanceFeeSlider, this.elements.performanceFee, CONFIG.PERFORMANCE_FEE, CONFIG.STEPS.PERCENT);
        this.configureSliderPair(this.elements.inflationRateSlider, this.elements.inflationRate, CONFIG.INFLATION_RATE, CONFIG.STEPS.PERCENT);
        this.configureSliderPair(this.elements.taxRateSlider, this.elements.taxRate, CONFIG.TAX_RATE, CONFIG.STEPS.TAX_RATE);
        this.configureContributionFrequencyOptions(this.elements.contributionFrequency);
        this.configureCurrencyInput(this.elements.contributionAmount, CONFIG.CONTRIBUTION_AMOUNT);
        this.configureWithdrawalModeOptions(this.elements.withdrawalMode);
        this.configureCurrencyInput(this.elements.withdrawalValue, CONFIG.WITHDRAWAL_VALUE);
        this.elements.compounding.checked = CONFIG.COMPOUNDING_DEFAULT;
    }

    configureCurrencyInput(input, config) {
        input.dataset.min = config.MIN;
        input.dataset.max = config.MAX;
        input.value = formatNumberWithCommas(config.DEFAULT);
    }

    configureSliderPair(slider, input, config, step = 1) {
        [slider, input].forEach(element => {
            element.min = config.MIN;
            element.max = config.MAX;
            element.step = step;
            element.value = config.DEFAULT;
        });
    }

    configureContributionFrequencyOptions(select) {
        select.replaceChildren();

        ALLOWED_FREQUENCIES.forEach(frequency => {
            const option = document.createElement('option');
            option.value = String(frequency);
            option.textContent = CONFIG.FREQUENCY_LABELS[frequency];
            option.selected = frequency === CONFIG.FREQUENCY.MONTHLY;
            select.appendChild(option);
        });
    }

    configureWithdrawalModeOptions(select) {
        select.replaceChildren();

        ALLOWED_WITHDRAWAL_MODES.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = CONFIG.WITHDRAWAL_MODE_LABELS[mode];
            option.selected = mode === CONFIG.WITHDRAWAL_MODES.NONE;
            select.appendChild(option);
        });
    }

    initializeEventListeners() {
        // Theme toggle
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());

        // Create debounced calculate function
        this.debouncedCalculate = debounce(() => this.calculate(), CONFIG.DEBOUNCE_DELAY);

        // Input synchronization for sliders
        this.syncSliderInputs(this.elements.yearsSlider, this.elements.years);
        this.syncSliderInputs(this.elements.growthRateSlider, this.elements.growthRate);
        this.syncSliderInputs(this.elements.performanceFeeSlider, this.elements.performanceFee);
        this.syncSliderInputs(this.elements.inflationRateSlider, this.elements.inflationRate);
        this.syncSliderInputs(this.elements.taxRateSlider, this.elements.taxRate);

        // Select and checkbox listeners
        this.elements.contributionFrequency.addEventListener('change', () => this.debouncedCalculate());
        this.elements.compounding.addEventListener('change', () => this.debouncedCalculate());
        this.elements.withdrawalMode.addEventListener('change', () => this.handleWithdrawalModeChange());
    }

    syncSliderInputs(slider, input) {
        slider.addEventListener('input', () => {
            input.value = slider.value;
            this.debouncedCalculate();
        });

        input.addEventListener('input', () => {
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const value = parseFloat(input.value);

            if (value >= min && value <= max) {
                slider.value = value;
            }
            this.debouncedCalculate();
        });
    }

    initializeCurrencyInputs() {
        const currencyInputs = document.querySelectorAll('.currency-input');

        currencyInputs.forEach(input => {
            // Format on blur
            input.addEventListener('blur', () => {
                const value = parseFormattedNumber(input.value);
                input.value = formatNumberWithCommas(value);
                this.debouncedCalculate();
            });

            // Handle input - allow typing numbers and commas
            input.addEventListener('input', () => {
                // Remove non-numeric characters except commas
                let value = input.value.replace(/[^0-9,]/g, '');
                input.value = value;
                this.debouncedCalculate();
            });

            // Select all on focus
            input.addEventListener('focus', () => {
                input.select();
            });
        });
    }

    // ============================================
    // VALIDATION
    // ============================================

    validateAllInputs() {
        let isValid = true;

        // Validate initial investment
        const initialInvestment = parseFormattedNumber(this.elements.initialInvestment.value);
        if (isNaN(initialInvestment) || initialInvestment < CONFIG.INITIAL_INVESTMENT.MIN) {
            this.showError('initialInvestmentError', `Minimum is $${CONFIG.INITIAL_INVESTMENT.MIN.toLocaleString()}`);
            isValid = false;
        } else if (initialInvestment > CONFIG.INITIAL_INVESTMENT.MAX) {
            this.showError('initialInvestmentError', `Maximum is $${CONFIG.INITIAL_INVESTMENT.MAX.toLocaleString()}`);
            isValid = false;
        } else {
            this.clearError('initialInvestmentError');
        }

        // Validate years
        const years = parseInt(this.elements.years.value);
        if (isNaN(years) || years < CONFIG.YEARS.MIN) {
            this.showError('yearsError', `Minimum is ${CONFIG.YEARS.MIN} year`);
            isValid = false;
        } else if (years > CONFIG.YEARS.MAX) {
            this.showError('yearsError', `Maximum is ${CONFIG.YEARS.MAX} years`);
            isValid = false;
        } else {
            this.clearError('yearsError');
        }

        // Validate growth rate
        const growthRate = parseFloat(this.elements.growthRate.value);
        if (isNaN(growthRate) || growthRate < CONFIG.GROWTH_RATE.MIN) {
            this.showError('growthRateError', `Minimum is ${CONFIG.GROWTH_RATE.MIN}%`);
            isValid = false;
        } else if (growthRate > CONFIG.GROWTH_RATE.MAX) {
            this.showError('growthRateError', `Maximum is ${CONFIG.GROWTH_RATE.MAX}%`);
            isValid = false;
        } else {
            this.clearError('growthRateError');
        }

        // Validate performance fee
        const performanceFee = parseFloat(this.elements.performanceFee.value);
        if (isNaN(performanceFee) || performanceFee < CONFIG.PERFORMANCE_FEE.MIN) {
            this.showError('performanceFeeError', `Minimum is ${CONFIG.PERFORMANCE_FEE.MIN}%`);
            isValid = false;
        } else if (performanceFee > CONFIG.PERFORMANCE_FEE.MAX) {
            this.showError('performanceFeeError', `Maximum is ${CONFIG.PERFORMANCE_FEE.MAX}%`);
            isValid = false;
        } else {
            this.clearError('performanceFeeError');
        }

        // Validate inflation rate
        const inflationRate = parseFloat(this.elements.inflationRate.value);
        if (isNaN(inflationRate) || inflationRate < CONFIG.INFLATION_RATE.MIN) {
            this.showError('inflationRateError', `Minimum is ${CONFIG.INFLATION_RATE.MIN}%`);
            isValid = false;
        } else if (inflationRate > CONFIG.INFLATION_RATE.MAX) {
            this.showError('inflationRateError', `Maximum is ${CONFIG.INFLATION_RATE.MAX}%`);
            isValid = false;
        } else {
            this.clearError('inflationRateError');
        }

        // Validate tax rate
        const taxRate = parseFloat(this.elements.taxRate.value);
        if (isNaN(taxRate) || taxRate < CONFIG.TAX_RATE.MIN) {
            this.showError('taxRateError', `Minimum is ${CONFIG.TAX_RATE.MIN}%`);
            isValid = false;
        } else if (taxRate > CONFIG.TAX_RATE.MAX) {
            this.showError('taxRateError', `Maximum is ${CONFIG.TAX_RATE.MAX}%`);
            isValid = false;
        } else {
            this.clearError('taxRateError');
        }

        // Validate contribution amount
        const contributionAmount = parseFormattedNumber(this.elements.contributionAmount.value);
        if (isNaN(contributionAmount) || contributionAmount < CONFIG.CONTRIBUTION_AMOUNT.MIN) {
            this.showError('contributionAmountError', `Minimum is $${CONFIG.CONTRIBUTION_AMOUNT.MIN}`);
            isValid = false;
        } else if (contributionAmount > CONFIG.CONTRIBUTION_AMOUNT.MAX) {
            this.showError('contributionAmountError', `Maximum is $${CONFIG.CONTRIBUTION_AMOUNT.MAX.toLocaleString()}`);
            isValid = false;
        } else {
            this.clearError('contributionAmountError');
        }

        // Validate withdrawal value if visible
        if (this.elements.withdrawalValueGroup.style.display !== 'none') {
            const withdrawalValue = parseFormattedNumber(this.elements.withdrawalValue.value);
            if (isNaN(withdrawalValue) || withdrawalValue < CONFIG.WITHDRAWAL_VALUE.MIN) {
                this.showError('withdrawalValueError', `Minimum is $${CONFIG.WITHDRAWAL_VALUE.MIN}`);
                isValid = false;
            } else if (withdrawalValue > CONFIG.WITHDRAWAL_VALUE.MAX) {
                this.showError('withdrawalValueError', `Maximum is $${CONFIG.WITHDRAWAL_VALUE.MAX.toLocaleString()}`);
                isValid = false;
            } else {
                this.clearError('withdrawalValueError');
            }
        }

        return isValid;
    }

    showError(elementId, message) {
        const element = this.elements[elementId];
        if (element) {
            element.textContent = message;
        }
    }

    clearError(elementId) {
        const element = this.elements[elementId];
        if (element) {
            element.textContent = '';
        }
    }

    // ============================================
    // INPUT HANDLING
    // ============================================

    handleWithdrawalModeChange() {
        const mode = this.elements.withdrawalMode.value;
        const group = this.elements.withdrawalValueGroup;
        const prefix = this.elements.withdrawalPrefix;

        if (mode === CONFIG.WITHDRAWAL_MODES.NONE) {
            group.style.display = 'none';
            this.elements.withdrawalValue.value = '0';
        } else {
            group.style.display = 'block';
            prefix.textContent = mode === CONFIG.WITHDRAWAL_MODES.PERCENTAGE ? '%' : '$';
            this.elements.withdrawalValue.placeholder = mode === CONFIG.WITHDRAWAL_MODES.PERCENTAGE ? '5' : '1,000';
        }

        this.debouncedCalculate();
    }

    getInputValues() {
        return normalizeInvestmentParams({
            initialInvestment: this.elements.initialInvestment.value,
            years: this.elements.years.value,
            annualGrowthRate: this.elements.growthRate.value,
            performanceFee: this.elements.performanceFee.value,
            inflationRate: this.elements.inflationRate.value,
            taxRate: this.elements.taxRate.value,
            contributionFrequency: this.elements.contributionFrequency.value,
            contributionAmount: this.elements.contributionAmount.value,
            compounding: this.elements.compounding.checked,
            withdrawalMode: this.elements.withdrawalMode.value,
            withdrawalValue: this.elements.withdrawalValue.value
        });
    }

    // ============================================
    // CALCULATION ENGINE
    // ============================================

    calculate() {
        if (!this.validateAllInputs()) {
            return;
        }

        const params = this.getInputValues();
        const results = this.runInvestmentCalculation(params);

        this.updateSummaryCards(results, params);
        this.updateTable(results);
        this.updateCharts(results, params);
    }

    runInvestmentCalculation(params) {
        return runInvestmentCalculation(params);
    }

    // ============================================
    // UI UPDATES
    // ============================================

    updateSummaryCards(results, params) {
        this.elements.finalBalance.textContent = formatCurrency(results.finalBalance);
        this.elements.realValue.textContent = formatCurrency(results.realValue);
        this.elements.totalInterest.textContent = formatCurrency(results.totalInterest);
        this.elements.totalTaxes.textContent = formatCurrency(results.totalTaxes);
        this.elements.totalFees.textContent = formatCurrency(results.totalFees);
        this.elements.totalContributions.textContent = formatCurrency(results.totalContributions);
        this.elements.totalWithdrawals.textContent = formatCurrency(results.totalWithdrawals);

        if (results.depletionYear) {
            this.elements.depletionCard.style.display = 'block';
            this.elements.depletionYear.textContent = `Year ${results.depletionYear}`;
        } else {
            this.elements.depletionCard.style.display = 'none';
        }
    }

    updateTable(results) {
        const tbody = this.elements.tableBody;
        tbody.innerHTML = '';

        let totalOpeningBalance = 0;
        let totalInterest = 0;
        let totalTaxes = 0;
        let totalFees = 0;
        let totalContributions = 0;
        let totalWithdrawals = 0;

        results.yearlyResults.forEach(result => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.year}</td>
                <td>${formatCurrency(result.openingBalance)}</td>
                <td>${formatCurrency(result.interestEarned)}</td>
                <td>${formatCurrency(result.taxesPaid)}</td>
                <td>${formatCurrency(result.feesPaid)}</td>
                <td>${formatCurrency(result.contributions)}</td>
                <td>${formatCurrency(result.withdrawals)}</td>
                <td>${formatCurrency(result.closingBalance)}</td>
            `;
            tbody.appendChild(row);

            totalOpeningBalance += result.openingBalance;
            totalInterest += result.interestEarned;
            totalTaxes += result.taxesPaid;
            totalFees += result.feesPaid;
            totalContributions += result.contributions;
            totalWithdrawals += result.withdrawals;
        });

        // Update totals row
        this.elements.totalOpeningBalance.textContent = formatCurrency(totalOpeningBalance);
        this.elements.totalInterestTable.textContent = formatCurrency(totalInterest);
        this.elements.totalTaxesTable.textContent = formatCurrency(totalTaxes);
        this.elements.totalFeesTable.textContent = formatCurrency(totalFees);
        this.elements.totalContributionsTable.textContent = formatCurrency(totalContributions);
        this.elements.totalWithdrawalsTable.textContent = formatCurrency(totalWithdrawals);
        this.elements.totalClosingBalance.textContent = formatCurrency(results.finalBalance);
    }

    // ============================================
    // CHARTS
    // ============================================

    initializeCharts() {
        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            console.error('Chart.js not loaded');
            this.showChartError();
            return;
        }

        try {
            this.initializeBalanceChart();
            this.initializeBreakdownChart();
            this.chartsInitialized = true;
            this.updateChartColors();
        } catch (error) {
            console.error('Failed to initialize charts:', error);
            this.showChartError();
        }
    }

    showChartError() {
        if (this.elements.chartError) {
            this.elements.chartError.style.display = 'block';
        }
        // Hide chart containers
        const chartContainers = document.querySelectorAll('.chart-container');
        chartContainers.forEach(container => {
            container.style.display = 'none';
        });
    }

    initializeBalanceChart() {
        const balanceCtx = document.getElementById('balanceChart').getContext('2d');

        this.balanceChart = new Chart(balanceCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Balance',
                    data: [],
                    borderColor: CONFIG.COLORS.PRIMARY,
                    backgroundColor: 'rgba(15, 98, 254, 0.12)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 8,
                    pointBackgroundColor: CONFIG.COLORS.PRIMARY,
                    pointHoverBackgroundColor: CONFIG.COLORS.PRIMARY,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(38, 38, 38, 0.95)',
                        titleColor: '#F4F4F4',
                        bodyColor: '#F4F4F4',
                        borderColor: CONFIG.COLORS.PRIMARY,
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            title: (items) => `Year ${items[0].label}`,
                            label: (context) => {
                                const dataIndex = context.dataIndex;
                                const balance = context.parsed.y;
                                const lines = [`Balance: ${formatCurrency(balance)}`];

                                // Add breakdown info if we have yearly data
                                if (this.lastResults && this.lastResults.yearlyResults[dataIndex - 1]) {
                                    const yearData = this.lastResults.yearlyResults[dataIndex - 1];
                                    lines.push(`Interest: ${formatCurrency(yearData.interestEarned)}`);
                                    if (yearData.contributions > 0) {
                                        lines.push(`Contributions: ${formatCurrency(yearData.contributions)}`);
                                    }
                                    if (yearData.feesPaid > 0) {
                                        lines.push(`Fees: ${formatCurrency(yearData.feesPaid)}`);
                                    }
                                    if (yearData.taxesPaid > 0) {
                                        lines.push(`Taxes: ${formatCurrency(yearData.taxesPaid)}`);
                                    }
                                }
                                return lines;
                            }
                        }
                    },
                    annotation: {
                        annotations: {}
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Year',
                            color: '#525252'
                        },
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#525252'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Balance ($)',
                            color: '#525252'
                        },
                        ticks: {
                            color: '#525252',
                            callback: function(value) {
                                return formatCompactCurrency(value);
                            }
                        },
                        grid: {
                            color: '#E0E0E0'
                        }
                    }
                }
            }
        });
    }

    initializeBreakdownChart() {
        const breakdownCtx = document.getElementById('breakdownChart').getContext('2d');

        this.breakdownChart = new Chart(breakdownCtx, {
            type: 'doughnut',
            data: {
                labels: ['Initial Investment', 'Net Interest', 'Contributions', 'Fees & Taxes'],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        CONFIG.COLORS.PRIMARY,
                        CONFIG.COLORS.SECONDARY,
                        CONFIG.COLORS.TERTIARY,
                        CONFIG.COLORS.QUATERNARY
                    ],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: '#161616'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(38, 38, 38, 0.95)',
                        titleColor: '#F4F4F4',
                        bodyColor: '#F4F4F4',
                        borderColor: CONFIG.COLORS.PRIMARY,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + Math.abs(b), 0);
                                const percentage = total > 0 ? ((Math.abs(value) / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${formatCurrency(Math.abs(value))} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    updateCharts(results, params) {
        if (!this.chartsInitialized) return;

        // Store results for tooltip access
        this.lastResults = results;

        // Update balance chart
        const years = results.yearlyResults.map(r => r.year);
        const balances = results.yearlyResults.map(r => r.closingBalance);

        // Add year 0 (initial investment)
        years.unshift(0);
        balances.unshift(params.initialInvestment);

        this.balanceChart.data.labels = years;
        this.balanceChart.data.datasets[0].data = balances;

        // Update milestone annotations
        this.updateMilestoneAnnotations(results.finalBalance, params.initialInvestment);

        this.balanceChart.update('none');

        // Update breakdown chart
        const netInterest = results.totalInterest - results.totalTaxes - results.totalFees;
        const breakdownData = [
            params.initialInvestment,
            Math.max(0, netInterest),
            results.totalContributions,
            results.totalFees + results.totalTaxes
        ];

        this.breakdownChart.data.datasets[0].data = breakdownData;
        this.breakdownChart.update('none');
    }

    updateMilestoneAnnotations(finalBalance, initialInvestment) {
        const annotations = {};
        const maxBalance = Math.max(finalBalance, initialInvestment);

        // Find relevant milestones
        const relevantMilestones = CONFIG.MILESTONES.filter(m =>
            m > initialInvestment && m <= maxBalance * 1.1
        );

        relevantMilestones.forEach((milestone, index) => {
            annotations[`milestone${index}`] = {
                type: 'line',
                yMin: milestone,
                yMax: milestone,
                borderColor: CONFIG.COLORS.MILESTONE,
                borderWidth: 1,
                borderDash: [5, 5],
                label: {
                    display: true,
                    content: formatCompactCurrency(milestone),
                    position: 'end',
                    backgroundColor: 'rgba(36, 161, 72, 0.9)',
                    color: '#fff',
                    font: {
                        size: 10,
                        weight: 'bold'
                    },
                    padding: 4
                }
            };
        });

        if (this.balanceChart.options.plugins.annotation) {
            this.balanceChart.options.plugins.annotation.annotations = annotations;
        }
    }

    updateChartColors() {
        if (!this.chartsInitialized) return;

        const isDark = document.documentElement.getAttribute('data-color-scheme') === 'dark';

        if (isDark) {
            // Dark mode colors
            this.balanceChart.options.scales.x.ticks.color = '#FFFFFF';
            this.balanceChart.options.scales.y.ticks.color = '#FFFFFF';
            this.balanceChart.options.scales.x.title.color = '#FFFFFF';
            this.balanceChart.options.scales.y.title.color = '#FFFFFF';
            this.balanceChart.options.scales.y.grid.color = '#393939';

            this.balanceChart.data.datasets[0].borderColor = CONFIG.COLORS.PRIMARY_DARK;
            this.balanceChart.data.datasets[0].backgroundColor = 'rgba(120, 169, 255, 0.14)';
            this.balanceChart.data.datasets[0].pointBackgroundColor = CONFIG.COLORS.PRIMARY_DARK;

            this.breakdownChart.options.plugins.legend.labels.color = '#FFFFFF';
            this.breakdownChart.data.datasets[0].backgroundColor = [
                CONFIG.COLORS.PRIMARY_DARK,
                CONFIG.COLORS.SECONDARY_DARK,
                CONFIG.COLORS.TERTIARY_DARK,
                CONFIG.COLORS.QUATERNARY_DARK
            ];
        } else {
            // Light mode colors
            this.balanceChart.options.scales.x.ticks.color = '#525252';
            this.balanceChart.options.scales.y.ticks.color = '#525252';
            this.balanceChart.options.scales.x.title.color = '#161616';
            this.balanceChart.options.scales.y.title.color = '#161616';
            this.balanceChart.options.scales.y.grid.color = '#E0E0E0';

            this.balanceChart.data.datasets[0].borderColor = CONFIG.COLORS.PRIMARY;
            this.balanceChart.data.datasets[0].backgroundColor = 'rgba(15, 98, 254, 0.12)';
            this.balanceChart.data.datasets[0].pointBackgroundColor = CONFIG.COLORS.PRIMARY;

            this.breakdownChart.options.plugins.legend.labels.color = '#161616';
            this.breakdownChart.data.datasets[0].backgroundColor = [
                CONFIG.COLORS.PRIMARY,
                CONFIG.COLORS.SECONDARY,
                CONFIG.COLORS.TERTIARY,
                CONFIG.COLORS.QUATERNARY
            ];
        }

        this.balanceChart.update('none');
        this.breakdownChart.update('none');
    }

    // ============================================
    // THEME MANAGEMENT
    // ============================================

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-color-scheme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-color-scheme', newTheme);
        this.saveTheme(newTheme);
        this.updateChartColors();
    }

    loadTheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = this.savedTheme || (prefersDark ? 'dark' : 'light');

        document.documentElement.setAttribute('data-color-scheme', theme);
    }

    saveTheme(theme) {
        this.savedTheme = theme;
    }

    // ============================================
    // TAB SYSTEM
    // ============================================

    initializeTabSystem() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Update button states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('tab-btn--active', isActive);
            btn.setAttribute('aria-selected', isActive);
        });

        // Show/hide tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('hidden', content.id !== `${tabName}-tab`);
        });

        // Initialize comparison tab on first visit
        if (tabName === 'comparison' && this.comparisonManager) {
            this.comparisonManager.ensureInitialized();
        }
    }
}

// ============================================
// COMPARISON MANAGER
// ============================================

class ComparisonManager {
    constructor(calculator) {
        this.calculator = calculator;
        this.scenarios = [];
        this.nextId = 1;
        this.initialized = false;
        this.container = document.getElementById('scenariosContainer');
        this.addBtn = document.getElementById('addScenarioBtn');

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        if (this.addBtn) {
            this.addBtn.addEventListener('click', () => this.addScenario());
        }
    }

    ensureInitialized() {
        if (!this.initialized && this.scenarios.length === 0) {
            // Add first scenario with current calculator values
            this.addScenario();
            this.initialized = true;
        }
    }

    addScenario() {
        const id = this.nextId++;
        const values = this.calculator.getInputValues();
        const name = `Scenario ${id}`;

        const scenario = {
            id,
            name,
            values: { ...values },
            results: null
        };

        this.scenarios.push(scenario);
        this.renderScenario(scenario);
        this.calculateScenario(id);
    }

    removeScenario(id) {
        // Don't remove if it's the last scenario
        if (this.scenarios.length <= 1) {
            return;
        }

        const index = this.scenarios.findIndex(s => s.id === id);
        if (index > -1) {
            this.scenarios.splice(index, 1);
            const card = document.getElementById(`scenario-${id}`);
            if (card) {
                card.remove();
            }
        }
    }

    renderScenario(scenario) {
        const card = document.createElement('div');
        card.className = 'scenario-card';
        card.id = `scenario-${scenario.id}`;

        card.innerHTML = `
            <div class="scenario-header">
                <input type="text" class="scenario-name" value="${scenario.name}" data-id="${scenario.id}">
                <button class="scenario-remove" data-id="${scenario.id}" aria-label="Remove scenario">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="scenario-inputs">
                <!-- Initial Investment -->
                <div class="form-group">
                    <label class="form-label">Initial Investment</label>
                    <div class="input-wrapper">
                        <span class="input-prefix">$</span>
                        <input type="text" class="form-control scenario-input" data-field="initialInvestment" data-min="${CONFIG.INITIAL_INVESTMENT.MIN}" data-max="${CONFIG.INITIAL_INVESTMENT.MAX}" value="${formatNumberWithCommas(scenario.values.initialInvestment)}">
                    </div>
                </div>

                <!-- Years & Growth Rate -->
                <div class="scenario-input-row">
                    <div class="form-group">
                        <label class="form-label">Years</label>
                        <input type="number" class="form-control scenario-input" data-field="years" min="${CONFIG.YEARS.MIN}" max="${CONFIG.YEARS.MAX}" value="${scenario.values.years}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Growth Rate (%)</label>
                        <input type="number" class="form-control scenario-input" data-field="annualGrowthRate" min="${CONFIG.GROWTH_RATE.MIN}" max="${CONFIG.GROWTH_RATE.MAX}" step="${CONFIG.STEPS.PERCENT}" value="${scenario.values.annualGrowthRate}">
                    </div>
                </div>

                <!-- Performance Fee & Inflation -->
                <div class="scenario-input-row">
                    <div class="form-group">
                        <label class="form-label">Fee (%)</label>
                        <input type="number" class="form-control scenario-input" data-field="performanceFee" min="${CONFIG.PERFORMANCE_FEE.MIN}" max="${CONFIG.PERFORMANCE_FEE.MAX}" step="${CONFIG.STEPS.PERCENT}" value="${scenario.values.performanceFee}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Inflation (%)</label>
                        <input type="number" class="form-control scenario-input" data-field="inflationRate" min="${CONFIG.INFLATION_RATE.MIN}" max="${CONFIG.INFLATION_RATE.MAX}" step="${CONFIG.STEPS.PERCENT}" value="${scenario.values.inflationRate}">
                    </div>
                </div>

                <!-- Tax Rate -->
                <div class="form-group">
                    <label class="form-label">Tax Rate on Gains (%)</label>
                    <input type="number" class="form-control scenario-input" data-field="taxRate" min="${CONFIG.TAX_RATE.MIN}" max="${CONFIG.TAX_RATE.MAX}" step="${CONFIG.STEPS.TAX_RATE}" value="${scenario.values.taxRate}">
                </div>

                <!-- Contribution -->
                <div class="scenario-input-row">
                    <div class="form-group">
                        <label class="form-label">Frequency</label>
                        <select class="form-control scenario-input" data-field="contributionFrequency">
${renderContributionFrequencyOptions(scenario.values.contributionFrequency)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Contribution</label>
                        <div class="input-wrapper">
                            <span class="input-prefix">$</span>
                            <input type="text" class="form-control scenario-input" data-field="contributionAmount" data-min="${CONFIG.CONTRIBUTION_AMOUNT.MIN}" data-max="${CONFIG.CONTRIBUTION_AMOUNT.MAX}" value="${formatNumberWithCommas(scenario.values.contributionAmount)}">
                        </div>
                    </div>
                </div>

                <!-- Compounding -->
                <div class="form-group">
                    <div class="toggle-wrapper">
                        <input type="checkbox" class="toggle-input scenario-input" data-field="compounding" id="compounding-${scenario.id}" ${scenario.values.compounding ? 'checked' : ''}>
                        <label for="compounding-${scenario.id}" class="toggle-label">
                            <span class="toggle-slider"></span>
                            <span class="toggle-text">Compounding</span>
                        </label>
                    </div>
                </div>

                <!-- Withdrawal -->
                <div class="scenario-input-row">
                    <div class="form-group">
                        <label class="form-label">Withdrawal</label>
                        <select class="form-control scenario-input" data-field="withdrawalMode">
${renderWithdrawalModeOptions(scenario.values.withdrawalMode, CONFIG.WITHDRAWAL_MODE_SHORT_LABELS)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Amount</label>
                        <input type="number" class="form-control scenario-input" data-field="withdrawalValue" min="${CONFIG.WITHDRAWAL_VALUE.MIN}" max="${CONFIG.WITHDRAWAL_VALUE.MAX}" value="${scenario.values.withdrawalValue}">
                    </div>
                </div>
            </div>

            <div class="scenario-summary">
                <div class="scenario-summary-title">Results</div>
                <div class="scenario-summary-grid">
                    <div class="scenario-summary-item scenario-summary-item--highlight">
                        <div class="scenario-summary-item__label">Final Balance</div>
                        <div class="scenario-summary-item__value" data-result="finalBalance">$0.00</div>
                    </div>
                    <div class="scenario-summary-item">
                        <div class="scenario-summary-item__label">Real Value</div>
                        <div class="scenario-summary-item__value" data-result="realValue">$0.00</div>
                    </div>
                    <div class="scenario-summary-item">
                        <div class="scenario-summary-item__label">Interest</div>
                        <div class="scenario-summary-item__value" data-result="totalInterest">$0.00</div>
                    </div>
                    <div class="scenario-summary-item">
                        <div class="scenario-summary-item__label">Taxes</div>
                        <div class="scenario-summary-item__value" data-result="totalTaxes">$0.00</div>
                    </div>
                    <div class="scenario-summary-item">
                        <div class="scenario-summary-item__label">Fees</div>
                        <div class="scenario-summary-item__value" data-result="totalFees">$0.00</div>
                    </div>
                    <div class="scenario-summary-item">
                        <div class="scenario-summary-item__label">Contributions</div>
                        <div class="scenario-summary-item__value" data-result="totalContributions">$0.00</div>
                    </div>
                </div>
            </div>
        `;

        this.container.appendChild(card);
        this.attachScenarioEventListeners(card, scenario.id);
    }

    attachScenarioEventListeners(card, scenarioId) {
        // Remove button
        const removeBtn = card.querySelector('.scenario-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => this.removeScenario(scenarioId));
        }

        // Name input
        const nameInput = card.querySelector('.scenario-name');
        if (nameInput) {
            nameInput.addEventListener('change', (e) => {
                const scenario = this.scenarios.find(s => s.id === scenarioId);
                if (scenario) {
                    scenario.name = e.target.value;
                }
            });
        }

        // All scenario inputs
        const inputs = card.querySelectorAll('.scenario-input');
        inputs.forEach(input => {
            const eventType = input.type === 'checkbox' ? 'change' : 'input';
            input.addEventListener(eventType, debounce(() => {
                this.updateScenarioValue(scenarioId, input);
                this.calculateScenario(scenarioId);
            }, CONFIG.DEBOUNCE_DELAY));
        });
    }

    updateScenarioValue(scenarioId, input) {
        const scenario = this.scenarios.find(s => s.id === scenarioId);
        if (!scenario) return;

        const field = input.dataset.field;
        let value;

        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (field === 'initialInvestment' || field === 'contributionAmount') {
            value = parseFormattedNumber(input.value);
        } else if (field === 'contributionFrequency') {
            value = parseInt(input.value);
        } else if (input.type === 'number') {
            value = parseFloat(input.value) || 0;
        } else {
            value = input.value;
        }

        scenario.values[field] = value;
        const rawValue = scenario.values[field];
        scenario.values = normalizeInvestmentParams(scenario.values);

        if (scenario.values[field] !== rawValue) {
            if (input.type === 'checkbox') {
                input.checked = scenario.values[field];
            } else {
                input.value = scenario.values[field];
            }
        }
    }

    calculateScenario(scenarioId) {
        const scenario = this.scenarios.find(s => s.id === scenarioId);
        if (!scenario) return;

        // Use the same calculation function from the main calculator
        scenario.values = normalizeInvestmentParams(scenario.values);
        const results = runInvestmentCalculation(scenario.values);
        scenario.results = results;

        this.updateScenarioResults(scenarioId, results);
    }

    updateScenarioResults(scenarioId, results) {
        const card = document.getElementById(`scenario-${scenarioId}`);
        if (!card) return;

        const resultElements = {
            finalBalance: card.querySelector('[data-result="finalBalance"]'),
            realValue: card.querySelector('[data-result="realValue"]'),
            totalInterest: card.querySelector('[data-result="totalInterest"]'),
            totalTaxes: card.querySelector('[data-result="totalTaxes"]'),
            totalFees: card.querySelector('[data-result="totalFees"]'),
            totalContributions: card.querySelector('[data-result="totalContributions"]')
        };

        if (resultElements.finalBalance) {
            resultElements.finalBalance.textContent = formatCurrency(results.finalBalance);
        }
        if (resultElements.realValue) {
            resultElements.realValue.textContent = formatCurrency(results.realValue);
        }
        if (resultElements.totalInterest) {
            resultElements.totalInterest.textContent = formatCurrency(results.totalInterest);
        }
        if (resultElements.totalTaxes) {
            resultElements.totalTaxes.textContent = formatCurrency(results.totalTaxes);
        }
        if (resultElements.totalFees) {
            resultElements.totalFees.textContent = formatCurrency(results.totalFees);
        }
        if (resultElements.totalContributions) {
            resultElements.totalContributions.textContent = formatCurrency(results.totalContributions);
        }
    }
}

// ============================================
// STANDALONE CALCULATION FUNCTION
// ============================================

// Export calculation function for use by ComparisonManager
function runInvestmentCalculation(params) {
    return calculateInvestmentProjection(normalizeInvestmentParams(params));
}

// ============================================
// INITIALIZATION
// ============================================

// Initialize the application when DOM is loaded
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.investmentCalculator = new InvestmentCalculator();
    });

    // Handle system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!window.investmentCalculator || !window.investmentCalculator.savedTheme) {
            const theme = e.matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-color-scheme', theme);
            if (window.investmentCalculator) {
                window.investmentCalculator.updateChartColors();
            }
        }
    });

    // Keyboard navigation enhancement
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeTooltips = document.querySelectorAll('.tooltip:hover');
            activeTooltips.forEach(tooltip => {
                tooltip.style.opacity = '0';
                tooltip.style.visibility = 'hidden';
            });
        }
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        calculateInvestmentProjection,
        normalizeInvestmentParams,
        runInvestmentCalculation
    };
}
