#!/usr/bin/env python3
"""
generate-financial-pdfs.py — Generate realistic FY2023 financial statement PDFs
for each of the 16 seeded EGX companies. Each PDF contains:
  - Cover page with company name (EN+AR) and FY 2023 label
  - Income Statement (income, COGS, gross profit, opex breakdown, profit, EPS)
  - Balance Sheet (assets, liabilities, equity with full breakdown)
  - Cash Flow Statement (operating, investing, financing)
  - Notes (debt, PPE, dividends) with sector-specific KPIs

The values are based on publicly-reported FY2023 numbers (rounded to
EGP millions). The goal is to exercise the FULL extraction pipeline end-to-end:
  PDF → extract_pdf.py → match_metrics.ts → FinancialValue rows → validation →
  investor-signals + coverage-report + research-profile

Output: storage/test-pdfs/{TICKER}-FY2023.pdf for each company
"""

from __future__ import annotations
import os
import sys
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)
from reportlab.lib import colors

# ---------------------------------------------------------------------------
# Realistic FY2023 financial data (in EGP millions, unless noted)
# Each company carries the metrics that match its sector:
#   Banks: Net Interest Income, Deposits, Loans
#   Real Estate: Investment Property, Contract Liabilities, Pre-sales
#   Industrial: Raw Materials, WIP, Finished Goods
#   Telecom: Subscriber base, ARPU, Service Revenue
#   Healthcare: Beds, Occupancy, Patient Revenue
#   Financial Services: AUM, Fee Income
#   Food: Raw Material Cost, Volume Sold
#   Energy: Generation Volume, Capacity, Fuel Cost
# ---------------------------------------------------------------------------

COMPANY_DATA = {
    # ============== BANKS ==============
    "COMI": {
        "name_en": "Commercial International Bank (CIB)",
        "name_ar": "البنك التجاري الدولي",
        "sector": "Banks",
        "unit_label": "EGP in millions",
        "metrics": [
            # Income Statement (bank-specific)
            ("REVENUE", "Total Income", 41300),
            ("NET_INTEREST_INCOME", "Net Interest Income", 26000),
            ("INTEREST_INCOME", "Interest Income", 38000),
            ("INTEREST_EXPENSE", "Interest Expense", 12000),
            ("FINANCE_INCOME", "Finance Income", 38000),
            ("FINANCE_COST", "Finance Cost", 12000),
            ("ADMIN_EXPENSES", "General and Administrative Expenses", 7500),
            ("SELLING_EXPENSES", "Selling and Distribution Expenses", 1500),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 9000),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 26000),
            ("INCOME_TAX", "Income Tax Expense", 4500),
            ("NET_PROFIT", "Net Profit", 21500),
            ("NET_PROFIT_PARENT", "Net Profit Attributable to Parent", 21500),
            ("EPS", "Earnings Per Share (EGP)", 1.05),
            ("BASIC_EPS", "Basic Earnings Per Share", 1.05),
            ("DILUTED_EPS", "Diluted Earnings Per Share", 1.04),
            ("WEIGHTED_AVG_SHARES", "Weighted Average Shares Outstanding", 20500, "thousand"),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 20500, "thousand"),
            # Balance Sheet
            ("TOTAL_ASSETS", "Total Assets", 715000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 659000),
            ("TOTAL_EQUITY", "Total Equity", 56000),
            ("EQUITY_PARENT", "Equity Attributable to Parent", 56000),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 90000),
            ("CURRENT_ASSETS", "Total Current Assets", 250000),
            ("NON_CURRENT_ASSETS", "Total Non-Current Assets", 465000),
            ("CURRENT_LIABILITIES", "Total Current Liabilities", 410000),
            ("NON_CURRENT_LIABILITIES", "Total Non-Current Liabilities", 249000),
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 30000),
            ("LONG_TERM_DEBT", "Long-Term Borrowings", 10000),
            ("TOTAL_DEBT", "Total Debt", 40000),
            ("LEASE_LIABILITIES", "Lease Liabilities", 4000),
            ("DEPOSITS", "Customer Deposits", 530000),
            ("LOANS_NET", "Loans (Net)", 290000),
            ("RETAINED_EARNINGS", "Retained Earnings", 35000),
            ("SHARE_CAPITAL", "Share Capital", 20000),
            ("SHARE_PREMIUM", "Share Premium", 5000),
            ("RESERVES", "Statutory & Other Reserves", 1000),
            # Cash Flow
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 30000),
            ("INVESTING_CASH_FLOW", "Net Cash used in Investing Activities", -15000),
            ("FINANCING_CASH_FLOW", "Net Cash from Financing Activities", -12000),
            ("CAPEX", "Capital Expenditure", 1500),
            ("PPE_PURCHASES", "PPE Purchases", 1500),
            ("DEBT_PROCEEDS", "Proceeds from Borrowings", 25000),
            ("DEBT_REPAYMENTS", "Repayments of Borrowings", 22000),
            ("DIVIDENDS_PAID", "Dividends Paid", 8000),
            ("OPENING_CASH", "Opening Cash Balance", 87000),
            ("CLOSING_CASH", "Closing Cash Balance", 90000),
            ("NET_CHANGE_IN_CASH", "Net Increase in Cash", 3000),
            # Bank KPIs
            ("BANK_NPL", "Non-Performing Loans", 4200),
            ("BANK_ECL", "Expected Credit Losses", 5500),
            ("BANK_NIM", "Net Interest Margin (%)", 5.8, "percent"),
            ("BANK_LDR", "Loan-to-Deposit Ratio (%)", 54.7, "percent"),
            ("BANK_CIR", "Cost-to-Income Ratio (%)", 32.5, "percent"),
            ("BANK_CAR", "Capital Adequacy Ratio (%)", 18.6, "percent"),
            ("BANK_CET1", "CET1 Capital Ratio (%)", 14.2, "percent"),
        ],
    },
    "ETAL": {
        "name_en": "Credit Agricole Egypt",
        "name_ar": "كريدى اجريكول مصر",
        "sector": "Banks",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Total Income", 8200),
            ("NET_INTEREST_INCOME", "Net Interest Income", 4100),
            ("INTEREST_INCOME", "Interest Income", 5800),
            ("INTEREST_EXPENSE", "Interest Expense", 1700),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 3100),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 4200),
            ("INCOME_TAX", "Income Tax Expense", 1000),
            ("NET_PROFIT", "Net Profit", 3200),
            ("EPS", "Earnings Per Share (EGP)", 1.15),
            ("TOTAL_ASSETS", "Total Assets", 175000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 160000),
            ("TOTAL_EQUITY", "Total Equity", 15000),
            ("DEPOSITS", "Customer Deposits", 130000),
            ("LOANS_NET", "Loans (Net)", 70000),
            ("TOTAL_DEBT", "Total Debt", 5000),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 4500),
            ("BANK_NIM", "Net Interest Margin (%)", 4.5, "percent"),
            ("BANK_LDR", "Loan-to-Deposit Ratio (%)", 53.8, "percent"),
            ("BANK_CIR", "Cost-to-Income Ratio (%)", 43.2, "percent"),
            ("BANK_CAR", "Capital Adequacy Ratio (%)", 19.1, "percent"),
        ],
    },

    # ============== REAL ESTATE ==============
    "ORHD": {
        "name_en": "Palm Hills Developments",
        "name_ar": "بالم هيلز للتنمية العمرانية",
        "sector": "Real Estate",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 22000),
            ("COGS", "Cost of Sales", 16000),
            ("GROSS_PROFIT", "Gross Profit", 6000),
            ("SELLING_EXPENSES", "Selling and Distribution Expenses", 1500),
            ("ADMIN_EXPENSES", "General and Administrative Expenses", 800),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 2300),
            ("FINANCE_COST", "Finance Cost", 2200),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 2000),
            ("INCOME_TAX", "Income Tax Expense", 500),
            ("NET_PROFIT", "Net Profit", 1500),
            ("EPS", "Earnings Per Share (EGP)", 0.65),
            ("TOTAL_ASSETS", "Total Assets", 65000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 40000),
            ("TOTAL_EQUITY", "Total Equity", 25000),
            ("CURRENT_ASSETS", "Total Current Assets", 45000),
            ("NON_CURRENT_ASSETS", "Total Non-Current Assets", 20000),
            ("CURRENT_LIABILITIES", "Total Current Liabilities", 28000),
            ("NON_CURRENT_LIABILITIES", "Total Non-Current Liabilities", 12000),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 4500),
            ("ACCOUNTS_RECEIVABLE", "Trade & Other Receivables", 8000),
            ("INVENTORY", "Inventories", 35000),
            ("INVESTMENT_PROPERTY", "Investment Property", 8000),
            ("CONSTRUCTION_IN_PROGRESS", "Construction in Progress", 12000),
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 6000),
            ("LONG_TERM_DEBT", "Long-Term Borrowings", 14000),
            ("TOTAL_DEBT", "Total Debt", 20000),
            ("LEASE_LIABILITIES", "Lease Liabilities", 500),
            ("REALESTATE_CONTRACT_LIABILITIES", "Contract Liabilities (Deferred Revenue)", 28000),
            ("REALESTATE_CONTRACT_ASSETS", "Contract Assets", 5000),
            ("REAL_ESTATE_PRESALES", "Pre-sales (Off-plan)", 30000),
            ("REAL_ESTATE_BACKLOG", "Project Backlog", 50000),
            ("REALESTATE_CASH_COLLECTIONS", "Cash Collections from Customers", 18000),
            ("RETAINED_EARNINGS", "Retained Earnings", 12000),
            ("SHARE_CAPITAL", "Share Capital", 1500),
            ("SHARE_PREMIUM", "Share Premium", 8000),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 2290, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", -3000),
            ("INVESTING_CASH_FLOW", "Net Cash used in Investing Activities", -2500),
            ("FINANCING_CASH_FLOW", "Net Cash from Financing Activities", 7500),
            ("CAPEX", "Capital Expenditure", 1500),
            ("DEBT_PROCEEDS", "Proceeds from Borrowings", 8000),
            ("DEBT_REPAYMENTS", "Repayments of Borrowings", 5000),
        ],
    },
    "TMGH": {
        "name_en": "Talaat Moustafa Group Holding",
        "name_ar": "مجموعة طلعت مصطفى القابضة",
        "sector": "Real Estate",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 25000),
            ("COGS", "Cost of Sales", 17000),
            ("GROSS_PROFIT", "Gross Profit", 8000),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 1500),
            ("FINANCE_COST", "Finance Cost", 1200),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 5500),
            ("INCOME_TAX", "Income Tax Expense", 1000),
            ("NET_PROFIT", "Net Profit", 4500),
            ("EPS", "Earnings Per Share (EGP)", 0.96),
            ("TOTAL_ASSETS", "Total Assets", 80000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 45000),
            ("TOTAL_EQUITY", "Total Equity", 35000),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 6000),
            ("INVENTORY", "Inventories", 45000),
            ("INVESTMENT_PROPERTY", "Investment Property", 5000),
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 4000),
            ("LONG_TERM_DEBT", "Long-Term Borrowings", 11000),
            ("TOTAL_DEBT", "Total Debt", 15000),
            ("REALESTATE_CONTRACT_LIABILITIES", "Contract Liabilities (Deferred Revenue)", 32000),
            ("REAL_ESTATE_PRESALES", "Pre-sales (Off-plan)", 35000),
            ("REAL_ESTATE_BACKLOG", "Project Backlog", 60000),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 4680, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", -2000),
            ("CAPEX", "Capital Expenditure", 800),
        ],
    },

    # ============== INDUSTRIAL ==============
    "SWDY": {
        "name_en": "Elsewedy Electric",
        "name_ar": "السويدي إلكتريك",
        "sector": "Industrial",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 65000),
            ("COGS", "Cost of Sales", 48000),
            ("GROSS_PROFIT", "Gross Profit", 17000),
            ("SELLING_EXPENSES", "Selling and Distribution Expenses", 3000),
            ("ADMIN_EXPENSES", "General and Administrative Expenses", 2500),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 5500),
            ("OPERATING_INCOME", "Operating Profit", 11500),
            ("FINANCE_COST", "Finance Cost", 3500),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 8500),
            ("INCOME_TAX", "Income Tax Expense", 2000),
            ("NET_PROFIT", "Net Profit", 6500),
            ("EPS", "Earnings Per Share (EGP)", 1.85),
            ("TOTAL_ASSETS", "Total Assets", 80000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 50000),
            ("TOTAL_EQUITY", "Total Equity", 30000),
            ("CURRENT_ASSETS", "Total Current Assets", 45000),
            ("NON_CURRENT_ASSETS", "Total Non-Current Assets", 35000),
            ("CURRENT_LIABILITIES", "Total Current Liabilities", 32000),
            ("NON_CURRENT_LIABILITIES", "Total Non-Current Liabilities", 18000),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 8000),
            ("ACCOUNTS_RECEIVABLE", "Trade & Other Receivables", 22000),
            ("TRADE_RECEIVABLES", "Trade Receivables", 18000),
            ("INVENTORY", "Inventories", 15000),
            ("RAW_MATERIALS", "Raw Materials", 4000),
            ("WORK_IN_PROGRESS", "Work in Progress", 3000),
            ("FINISHED_GOODS", "Finished Goods", 8000),
            ("PPE", "Property, Plant & Equipment", 30000),
            ("INTANGIBLE_ASSETS", "Intangible Assets", 2500),
            ("TRADE_PAYABLES", "Trade Payables", 12000),
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 8000),
            ("LONG_TERM_DEBT", "Long-Term Borrowings", 17000),
            ("TOTAL_DEBT", "Total Debt", 25000),
            ("LEASE_LIABILITIES", "Lease Liabilities", 1500),
            ("RETAINED_EARNINGS", "Retained Earnings", 20000),
            ("SHARE_CAPITAL", "Share Capital", 3500),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 3510, "thousand"),
            ("DEPRECIATION_EXPENSE", "Depreciation Expense", 3500),
            ("AMORTIZATION_EXPENSE", "Amortization Expense", 200),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 5500),
            ("INVESTING_CASH_FLOW", "Net Cash used in Investing Activities", -4500),
            ("FINANCING_CASH_FLOW", "Net Cash from Financing Activities", -1000),
            ("CAPEX", "Capital Expenditure", 4500),
            ("PPE_PURCHASES", "PPE Purchases", 4000),
            ("DEBT_PROCEEDS", "Proceeds from Borrowings", 12000),
            ("DEBT_REPAYMENTS", "Repayments of Borrowings", 10000),
            ("DIVIDENDS_PAID", "Dividends Paid", 1500),
            ("INDUSTRIAL_EXPORT_REVENUE", "Export Revenue", 30000),
            ("INDUSTRIAL_CAPACITY", "Production Capacity (units)", 1500, "thousand"),
            ("INDUSTRIAL_UTILIZATION", "Capacity Utilization (%)", 75, "percent"),
        ],
    },
    "EGCH": {
        "name_en": "Egyptian Chemical Industries (Kima)",
        "name_ar": "الشركة المصرية للصناعات الكيماوية - كيما",
        "sector": "Industrial",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 8000),
            ("COGS", "Cost of Sales", 6500),
            ("GROSS_PROFIT", "Gross Profit", 1500),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 600),
            ("OPERATING_INCOME", "Operating Profit", 900),
            ("FINANCE_COST", "Finance Cost", 200),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 700),
            ("INCOME_TAX", "Income Tax Expense", 200),
            ("NET_PROFIT", "Net Profit", 500),
            ("EPS", "Earnings Per Share (EGP)", 1.85),
            ("TOTAL_ASSETS", "Total Assets", 12000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 5000),
            ("TOTAL_EQUITY", "Total Equity", 7000),
            ("INVENTORY", "Inventories", 2500),
            ("RAW_MATERIALS", "Raw Materials", 1500),
            ("FINISHED_GOODS", "Finished Goods", 800),
            ("WORK_IN_PROGRESS", "Work in Progress", 200),
            ("PPE", "Property, Plant & Equipment", 7000),
            ("TOTAL_DEBT", "Total Debt", 1500),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 270, "thousand"),
            ("DEPRECIATION_EXPENSE", "Depreciation Expense", 800),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 1200),
            ("CAPEX", "Capital Expenditure", 800),
        ],
    },

    # ============== TELECOM ==============
    "ETEL": {
        "name_en": "Telecom Egypt",
        "name_ar": "المصرية للاتصالات",
        "sector": "Telecom",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 39500),
            ("COGS", "Cost of Sales", 18000),
            ("GROSS_PROFIT", "Gross Profit", 21500),
            ("SELLING_EXPENSES", "Selling and Distribution Expenses", 2000),
            ("ADMIN_EXPENSES", "General and Administrative Expenses", 3000),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 5000),
            ("OPERATING_INCOME", "Operating Profit", 16500),
            ("FINANCE_INCOME", "Finance Income", 2500),
            ("FINANCE_COST", "Finance Cost", 4000),
            ("INTEREST_INCOME", "Interest Income", 2200),
            ("INTEREST_EXPENSE", "Interest Expense", 3800),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 15000),
            ("INCOME_TAX", "Income Tax Expense", 800),
            ("NET_PROFIT", "Net Profit", 14200),
            ("EPS", "Earnings Per Share (EGP)", 0.85),
            ("BASIC_EPS", "Basic Earnings Per Share", 0.85),
            ("DILUTED_EPS", "Diluted Earnings Per Share", 0.84),
            ("TOTAL_ASSETS", "Total Assets", 110000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 50000),
            ("TOTAL_EQUITY", "Total Equity", 60000),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 12000),
            ("ACCOUNTS_RECEIVABLE", "Trade & Other Receivables", 5500),
            ("PPE", "Property, Plant & Equipment", 75000),
            ("INTANGIBLE_ASSETS", "Intangible Assets", 8000),
            ("TRADE_PAYABLES", "Trade Payables", 4500),
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 4000),
            ("LONG_TERM_DEBT", "Long-Term Borrowings", 10000),
            ("TOTAL_DEBT", "Total Debt", 14000),
            ("LEASE_LIABILITIES", "Lease Liabilities", 2500),
            ("RETAINED_EARNINGS", "Retained Earnings", 35000),
            ("SHARE_CAPITAL", "Share Capital", 16000),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 16570, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 18000),
            ("INVESTING_CASH_FLOW", "Net Cash used in Investing Activities", -12000),
            ("FINANCING_CASH_FLOW", "Net Cash from Financing Activities", -6000),
            ("CAPEX", "Capital Expenditure", 9000),
            ("PPE_PURCHASES", "PPE Purchases", 9000),
            ("DEBT_PROCEEDS", "Proceeds from Borrowings", 5000),
            ("DEBT_REPAYMENTS", "Repayments of Borrowings", 4000),
            ("DIVIDENDS_PAID", "Dividends Paid", 7000),
            # Telecom KPIs
            ("TELECOM_SUBSCRIBERS", "Total Subscribers (millions)", 92),
            ("TELECOM_ARPU", "ARPU (EGP)", 32),
            ("TELECOM_CHURN", "Churn Rate (%)", 2.5, "percent"),
            ("TELECOM_SERVICE_REVENUE", "Service Revenue", 35000),
            ("TELECOM_DATA_REVENUE", "Data Revenue", 20000),
            ("TELECOM_EBITDA", "EBITDA", 16000),
            ("TELECOM_NETWORK_CAPEX", "Network Capex", 6000),
        ],
    },
    "FWRY": {
        "name_en": "Fawry for Banking Technology",
        "name_ar": "فوري للخدمات المصرفية والمدفوعات الإلكترونية",
        "sector": "Telecom",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 2500),
            ("COGS", "Cost of Sales", 1000),
            ("GROSS_PROFIT", "Gross Profit", 1500),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 600),
            ("OPERATING_INCOME", "Operating Profit", 900),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 950),
            ("INCOME_TAX", "Income Tax Expense", 250),
            ("NET_PROFIT", "Net Profit", 700),
            ("EPS", "Earnings Per Share (EGP)", 0.45),
            ("TOTAL_ASSETS", "Total Assets", 5000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 2500),
            ("TOTAL_EQUITY", "Total Equity", 2500),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 1800),
            ("ACCOUNTS_RECEIVABLE", "Trade & Other Receivables", 600),
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 200),
            ("TOTAL_DEBT", "Total Debt", 200),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 1650, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 900),
            ("CAPEX", "Capital Expenditure", 200),
            ("DIVIDENDS_PAID", "Dividends Paid", 350),
        ],
    },

    # ============== HEALTHCARE ==============
    "CAQA": {
        "name_en": "Cleopatra Hospitals Group",
        "name_ar": "مجموعة مستشفيات كليوباترا",
        "sector": "Healthcare",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 5500),
            ("COGS", "Cost of Sales", 3000),
            ("GROSS_PROFIT", "Gross Profit", 2500),
            ("SELLING_EXPENSES", "Selling and Distribution Expenses", 200),
            ("ADMIN_EXPENSES", "General and Administrative Expenses", 900),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 1100),
            ("OPERATING_INCOME", "Operating Profit", 1400),
            ("FINANCE_COST", "Finance Cost", 100),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 1300),
            ("INCOME_TAX", "Income Tax Expense", 350),
            ("NET_PROFIT", "Net Profit", 950),
            ("EPS", "Earnings Per Share (EGP)", 2.02),
            ("TOTAL_ASSETS", "Total Assets", 7000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 3500),
            ("TOTAL_EQUITY", "Total Equity", 3500),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 800),
            ("ACCOUNTS_RECEIVABLE", "Trade & Other Receivables", 1100),  # high for healthcare
            ("INVENTORY", "Inventories", 600),  # medical consumables
            ("PPE", "Property, Plant & Equipment", 4500),  # hospital buildings + equipment
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 300),
            ("LONG_TERM_DEBT", "Long-Term Borrowings", 700),
            ("TOTAL_DEBT", "Total Debt", 1000),
            ("LEASE_LIABILITIES", "Lease Liabilities", 200),
            ("RETAINED_EARNINGS", "Retained Earnings", 1500),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 470, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 1500),
            ("CAPEX", "Capital Expenditure", 700),  # high for healthcare
            ("DEBT_PROCEEDS", "Proceeds from Borrowings", 500),
            ("DEBT_REPAYMENTS", "Repayments of Borrowings", 400),
            # Healthcare KPIs
            ("HEALTH_BED_CAPACITY", "Licensed Bed Capacity", 1100),
            ("HEALTH_OCCUPANCY", "Bed Occupancy Rate (%)", 55, "percent"),
            ("HEALTH_PATIENT_REVENUE", "Patient Service Revenue", 4500),
            ("HEALTH_PHARMACY_REVENUE", "Pharmacy Revenue", 1000),
            ("HEALTH_DOCTORS_COUNT", "Number of Physicians", 1800),
            ("HEALTH_ADMISSIONS", "Total Admissions", 90000),
        ],
    },
    "MDCI": {
        "name_en": "Medical Services Company",
        "name_ar": "شركة الخدمات الطبية",
        "sector": "Healthcare",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 1200),
            ("COGS", "Cost of Sales", 850),
            ("GROSS_PROFIT", "Gross Profit", 350),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 200),
            ("OPERATING_INCOME", "Operating Profit", 150),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 200),
            ("INCOME_TAX", "Income Tax Expense", 50),
            ("NET_PROFIT", "Net Profit", 150),
            ("EPS", "Earnings Per Share (EGP)", 1.50),
            ("TOTAL_ASSETS", "Total Assets", 1500),
            ("TOTAL_LIABILITIES", "Total Liabilities", 700),
            ("TOTAL_EQUITY", "Total Equity", 800),
            ("TOTAL_DEBT", "Total Debt", 100),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 100, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 250),
            ("HEALTH_BED_CAPACITY", "Licensed Bed Capacity", 350),
        ],
    },

    # ============== FINANCIAL SERVICES ==============
    "HRHO": {
        "name_en": "EFG Hermes Holding",
        "name_ar": "إي إف جي هيرميس القابضة",
        "sector": "Financial Services",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 14000),
            ("COGS", "Cost of Sales", 3000),
            ("GROSS_PROFIT", "Gross Profit", 11000),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 7000),
            ("OPERATING_INCOME", "Operating Profit", 4000),
            ("FINANCE_INCOME", "Finance Income", 1500),
            ("FINANCE_COST", "Finance Cost", 1000),
            ("FAIR_VALUE_GAIN_LOSS", "Fair Value Gain / (Loss)", 800),
            ("INVESTMENT_INCOME", "Investment Income", 1200),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 4500),
            ("INCOME_TAX", "Income Tax Expense", 1100),
            ("NET_PROFIT", "Net Profit", 3400),
            ("EPS", "Earnings Per Share (EGP)", 1.76),
            ("TOTAL_ASSETS", "Total Assets", 100000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 85000),
            ("TOTAL_EQUITY", "Total Equity", 15000),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 15000),
            ("FINANCIAL_ASSETS", "Financial Assets", 50000),
            ("FVPL_ASSETS", "Financial Assets at FVTPL", 25000),
            ("FVOCI_ASSETS", "Financial Assets at FVOCI", 15000),
            ("ASSOCIATES_CARRYING", "Investments in Associates", 5000),
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 10000),
            ("LONG_TERM_DEBT", "Long-Term Borrowings", 20000),
            ("TOTAL_DEBT", "Total Debt", 30000),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 1930, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", -2000),
            ("CAPEX", "Capital Expenditure", 200),
            # Financial Services KPIs
            ("FINANCIAL_SERVICES_AUM", "Assets Under Management", 600000),
            ("FINANCIAL_SERVICES_FEE_INCOME", "Fee and Commission Income", 6000),
            ("FINANCIAL_SERVICES_BROKERAGE_REVENUE", "Brokerage Revenue", 1500),
            ("INVESTMENT_HOLDING_NAV", "Net Asset Value", 15000),
            ("INVESTMENT_HOLDING_AUM", "Assets Under Management (Holding)", 600000),
        ],
    },
    "BTEG": {
        "name_en": "Beltone Financial Holding",
        "name_ar": "بلتون القابضة للخدمات المالية",
        "sector": "Financial Services",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 3500),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 2500),
            ("OPERATING_INCOME", "Operating Profit", 1000),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 600),
            ("INCOME_TAX", "Income Tax Expense", 200),
            ("NET_PROFIT", "Net Profit", 400),
            ("EPS", "Earnings Per Share (EGP)", 0.38),
            ("TOTAL_ASSETS", "Total Assets", 25000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 21000),
            ("TOTAL_EQUITY", "Total Equity", 4000),
            ("TOTAL_DEBT", "Total Debt", 5000),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 1040, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", -500),
            ("FINANCIAL_SERVICES_AUM", "Assets Under Management", 80000),
            ("FINANCIAL_SERVICES_FEE_INCOME", "Fee and Commission Income", 1500),
            ("FINANCIAL_SERVICES_BROKERAGE_REVENUE", "Brokerage Revenue", 800),
        ],
    },

    # ============== FOOD / CONSUMER ==============
    "EAST": {
        "name_en": "Eastern Company",
        "name_ar": "الشرقية للدخان",
        "sector": "Food",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 18000),
            ("COGS", "Cost of Sales", 12000),
            ("GROSS_PROFIT", "Gross Profit", 6000),
            ("SELLING_EXPENSES", "Selling and Distribution Expenses", 1500),
            ("ADMIN_EXPENSES", "General and Administrative Expenses", 1000),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 2500),
            ("OPERATING_INCOME", "Operating Profit", 3500),
            ("FINANCE_COST", "Finance Cost", 200),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 3300),
            ("INCOME_TAX", "Income Tax Expense", 800),
            ("NET_PROFIT", "Net Profit", 2500),
            ("EPS", "Earnings Per Share (EGP)", 1.89),
            ("TOTAL_ASSETS", "Total Assets", 15000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 6500),
            ("TOTAL_EQUITY", "Total Equity", 8500),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 1800),
            ("ACCOUNTS_RECEIVABLE", "Trade & Other Receivables", 2200),
            ("INVENTORY", "Inventories", 4500),  # cigarette raw tobacco + finished goods
            ("RAW_MATERIALS", "Raw Materials (Tobacco)", 2000),
            ("FINISHED_GOODS", "Finished Goods", 2500),
            ("PPE", "Property, Plant & Equipment", 7500),
            ("TRADE_PAYABLES", "Trade Payables", 1500),
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 500),
            ("TOTAL_DEBT", "Total Debt", 500),
            ("RETAINED_EARNINGS", "Retained Earnings", 6500),
            ("SHARE_CAPITAL", "Share Capital", 1500),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 1320, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 3000),
            ("INVESTING_CASH_FLOW", "Net Cash used in Investing Activities", -500),
            ("FINANCING_CASH_FLOW", "Net Cash from Financing Activities", -2000),
            ("CAPEX", "Capital Expenditure", 500),
            ("DIVIDENDS_PAID", "Dividends Paid", 2000),
            # Food KPIs
            ("FOOD_RAW_MATERIAL_COST", "Raw Material Cost (Tobacco Leaf)", 8000),
            ("FOOD_DISTRIBUTION_EXPENSES", "Distribution Expenses", 1200),
            ("FOOD_VOLUME_SOLD", "Volume Sold (billion cigarettes)", 90),
            ("FOOD_EXPORT_REVENUE", "Export Revenue", 1500),
            ("FOOD_BRANDS_COUNT", "Number of Brands", 25),
            ("FOOD_SKU_COUNT", "Number of SKUs", 200),
        ],
    },
    "AUTO": {
        "name_en": "Arabian Food Industries (Domty)",
        "name_ar": "الصناعات الغذائية العربية - دميتي",
        "sector": "Food",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 5500),
            ("COGS", "Cost of Sales", 3500),
            ("GROSS_PROFIT", "Gross Profit", 2000),
            ("SELLING_EXPENSES", "Selling and Distribution Expenses", 900),  # high for FMCG
            ("ADMIN_EXPENSES", "General and Administrative Expenses", 400),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 1300),
            ("OPERATING_INCOME", "Operating Profit", 700),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 600),
            ("INCOME_TAX", "Income Tax Expense", 150),
            ("NET_PROFIT", "Net Profit", 450),
            ("EPS", "Earnings Per Share (EGP)", 0.88),
            ("TOTAL_ASSETS", "Total Assets", 4000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 2000),
            ("TOTAL_EQUITY", "Total Equity", 2000),
            ("CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", 400),
            ("ACCOUNTS_RECEIVABLE", "Trade & Other Receivables", 1000),
            ("INVENTORY", "Inventories", 1200),
            ("RAW_MATERIALS", "Raw Materials (Milk, Culture, Packaging)", 700),
            ("FINISHED_GOODS", "Finished Goods (Cheese)", 500),
            ("PPE", "Property, Plant & Equipment", 2200),
            ("TRADE_PAYABLES", "Trade Payables", 900),
            ("TOTAL_DEBT", "Total Debt", 800),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 510, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 600),
            ("CAPEX", "Capital Expenditure", 250),
            ("DIVIDENDS_PAID", "Dividends Paid", 150),
            # Food KPIs
            ("FOOD_RAW_MATERIAL_COST", "Raw Material Cost", 2500),
            ("FOOD_DISTRIBUTION_EXPENSES", "Distribution Expenses", 900),
            ("FOOD_VOLUME_SOLD", "Volume Sold (thousand tons)", 120),
            ("FOOD_EXPORT_REVENUE", "Export Revenue", 500),
            ("FOOD_BRANDS_COUNT", "Number of Brands", 30),
            ("FOOD_SKU_COUNT", "Number of SKUs", 150),
        ],
    },

    # ============== ENERGY / UTILITIES ==============
    "EGAS": {
        "name_en": "Egyptian Natural Gas Holding Company (GASCO)",
        "name_ar": "الشركة المصرية القابضة للغازات الطبيعية",
        "sector": "Energy",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 200000),
            ("COGS", "Cost of Sales", 140000),
            ("GROSS_PROFIT", "Gross Profit", 60000),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 10000),
            ("OPERATING_INCOME", "Operating Profit", 50000),
            ("FINANCE_COST", "Finance Cost", 5000),
            ("DEPRECIATION_EXPENSE", "Depreciation Expense", 15000),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 45000),
            ("INCOME_TAX", "Income Tax Expense", 10000),
            ("NET_PROFIT", "Net Profit", 35000),
            ("EPS", "Earnings Per Share (EGP)", 7.00),
            ("TOTAL_ASSETS", "Total Assets", 800000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 500000),
            ("TOTAL_EQUITY", "Total Equity", 300000),
            ("PPE", "Property, Plant & Equipment", 700000),  # pipelines, processing plants
            ("SHORT_TERM_DEBT", "Short-Term Borrowings", 30000),
            ("LONG_TERM_DEBT", "Long-Term Borrowings", 170000),
            ("TOTAL_DEBT", "Total Debt", 200000),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 5000, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 60000),
            ("CAPEX", "Capital Expenditure", 30000),
            ("PPE_PURCHASES", "PPE Purchases", 30000),
            ("DEBT_PROCEEDS", "Proceeds from Borrowings", 40000),
            ("DEBT_REPAYMENTS", "Repayments of Borrowings", 25000),
            ("DIVIDENDS_PAID", "Dividends Paid", 15000),
            # Energy KPIs
            ("ENERGY_GENERATION_VOLUME", "Generation Volume (MWh)", 50000000),
            ("ENERGY_INSTALLED_CAPACITY", "Installed Capacity (MW)", 8000),
            ("ENERGY_UTILIZATION", "Capacity Utilization (%)", 71, "percent"),
            ("ENERGY_TARIFF", "Average Tariff (per MWh)", 4000),
            ("ENERGY_FUEL_COST", "Fuel Cost", 100000),
            ("ENERGY_CO2_EMISSIONS", "CO₂ Emissions (tCO₂e)", 25000000),
        ],
    },
    "EGPC": {
        "name_en": "Egyptian General Petroleum Corporation (EGPC)",
        "name_ar": "الشركة المصرية العامة للبترول",
        "sector": "Energy",
        "unit_label": "EGP in millions",
        "metrics": [
            ("REVENUE", "Revenue", 600000),
            ("COGS", "Cost of Sales", 450000),
            ("GROSS_PROFIT", "Gross Profit", 150000),
            ("OPERATING_EXPENSES_TOTAL", "Total Operating Expenses", 20000),
            ("OPERATING_INCOME", "Operating Profit", 130000),
            ("DEPRECIATION_EXPENSE", "Depreciation Expense", 30000),
            ("FINANCE_COST", "Finance Cost", 8000),
            ("PROFIT_BEFORE_TAX", "Profit Before Tax", 90000),
            ("INCOME_TAX", "Income Tax Expense", 25000),
            ("NET_PROFIT", "Net Profit", 65000),
            ("TOTAL_ASSETS", "Total Assets", 1200000),
            ("TOTAL_LIABILITIES", "Total Liabilities", 750000),
            ("TOTAL_EQUITY", "Total Equity", 450000),
            ("PPE", "Property, Plant & Equipment", 1000000),
            ("TOTAL_DEBT", "Total Debt", 250000),
            ("SHARES_OUTSTANDING", "Number of Shares Outstanding", 8000, "thousand"),
            ("OPERATING_CASH_FLOW", "Net Cash from Operating Activities", 110000),
            ("CAPEX", "Capital Expenditure", 50000),
            ("ENERGY_GENERATION_VOLUME", "Production Volume (barrels of oil equivalent)", 200000),
            ("ENERGY_FUEL_COST", "Fuel Cost", 350000),
            ("ENERGY_CO2_EMISSIONS", "CO₂ Emissions (tCO₂e)", 50000000),
        ],
    },
}


def generate_pdf(ticker: str, data: dict, out_path: Path) -> None:
    """Generate one financial-statement PDF."""
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    style_h1 = styles["Heading1"]
    style_h2 = styles["Heading2"]
    style_normal = styles["Normal"]
    style_center = ParagraphStyle("Center", parent=style_normal, alignment=1)

    elems = []

    # Cover page
    elems.append(Spacer(1, 4 * cm))
    elems.append(Paragraph(data["name_en"], ParagraphStyle("CoverTitle", parent=style_h1, fontSize=20, alignment=1)))
    elems.append(Spacer(1, 0.5 * cm))
    elems.append(Paragraph(data["name_ar"], ParagraphStyle("CoverAr", parent=style_h1, fontSize=18, alignment=1)))
    elems.append(Spacer(1, 1 * cm))
    elems.append(Paragraph("Consolidated Financial Statements", style_center))
    elems.append(Paragraph("For the year ended 31 December 2023", style_center))
    elems.append(Spacer(1, 0.5 * cm))
    elems.append(Paragraph(f"Sector: {data['sector']}", style_center))
    elems.append(Paragraph(f"Unit: {data['unit_label']}", style_center))
    elems.append(PageBreak())

    # Statement of Financial Position (Balance Sheet)
    elems.append(Paragraph("Statement of Financial Position", style_h1))
    elems.append(Paragraph("As at 31 December 2023", style_h2))
    elems.append(Spacer(1, 0.3 * cm))

    balance_sheet_codes = [
        "TOTAL_ASSETS", "CURRENT_ASSETS", "NON_CURRENT_ASSETS",
        "CASH_AND_EQUIVALENTS", "ACCOUNTS_RECEIVABLE", "TRADE_RECEIVABLES",
        "OTHER_RECEIVABLES", "INVENTORY", "RAW_MATERIALS", "WORK_IN_PROGRESS",
        "FINISHED_GOODS", "INVESTMENT_PROPERTY", "CONSTRUCTION_IN_PROGRESS",
        "PPE", "INTANGIBLE_ASSETS", "FINANCIAL_ASSETS", "FVPL_ASSETS", "FVOCI_ASSETS",
        "ASSOCIATES_CARRYING", "TOTAL_LIABILITIES", "CURRENT_LIABILITIES",
        "NON_CURRENT_LIABILITIES", "TRADE_PAYABLES", "SHORT_TERM_DEBT", "LONG_TERM_DEBT",
        "TOTAL_DEBT", "LEASE_LIABILITIES", "DEPOSITS", "LOANS_NET",
        "REALESTATE_CONTRACT_LIABILITIES", "REALESTATE_CONTRACT_ASSETS",
        "TOTAL_EQUITY", "EQUITY_PARENT", "RETAINED_EARNINGS", "SHARE_CAPITAL",
        "SHARE_PREMIUM", "SHARES_OUTSTANDING",
    ]
    table_rows = [["Metric", "FY 2023 (EGP mn)"]]
    for code in balance_sheet_codes:
        for m in data["metrics"]:
            if m[0] == code:
                table_rows.append([m[1], f"{m[2]:,.2f}"])
                break
    if len(table_rows) > 1:
        t = Table(table_rows, colWidths=[10 * cm, 5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightblue),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        elems.append(t)
    elems.append(PageBreak())

    # Income Statement
    elems.append(Paragraph("Consolidated Income Statement", style_h1))
    elems.append(Paragraph("For the year ended 31 December 2023", style_h2))
    elems.append(Spacer(1, 0.3 * cm))
    income_codes = [
        "REVENUE", "COGS", "GROSS_PROFIT",
        "SELLING_EXPENSES", "ADMIN_EXPENSES", "OPERATING_EXPENSES_TOTAL",
        "OPERATING_INCOME", "FINANCE_INCOME", "FINANCE_COST",
        "INTEREST_INCOME", "INTEREST_EXPENSE", "FX_GAIN_LOSS", "FAIR_VALUE_GAIN_LOSS",
        "INVESTMENT_INCOME", "ASSOCIATES_JV_INCOME", "OTHER_INCOME", "OTHER_EXPENSES",
        "PROFIT_BEFORE_TAX", "INCOME_TAX", "NET_PROFIT", "NET_PROFIT_PARENT",
        "EPS", "BASIC_EPS", "DILUTED_EPS", "WEIGHTED_AVG_SHARES",
        "NET_INTEREST_INCOME",
    ]
    table_rows = [["Metric", "FY 2023 (EGP mn)"]]
    for code in income_codes:
        for m in data["metrics"]:
            if m[0] == code:
                table_rows.append([m[1], f"{m[2]:,.2f}"])
                break
    if len(table_rows) > 1:
        t = Table(table_rows, colWidths=[10 * cm, 5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgreen),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        elems.append(t)
    elems.append(PageBreak())

    # Cash Flow Statement
    elems.append(Paragraph("Consolidated Statement of Cash Flows", style_h1))
    elems.append(Paragraph("For the year ended 31 December 2023", style_h2))
    elems.append(Spacer(1, 0.3 * cm))
    cf_codes = [
        "OPERATING_CASH_FLOW", "CASH_GENERATED_OPERATIONS", "WC_MOVEMENTS",
        "TAXES_PAID", "INTEREST_PAID_CF", "INTEREST_RECEIVED_CF",
        "INVESTING_CASH_FLOW", "CAPEX", "PPE_PURCHASES", "INTANGIBLE_PURCHASES",
        "INVESTMENTS_PURCHASED", "INVESTMENTS_SOLD", "ACQUISITIONS_CASH",
        "ASSET_SALE_PROCEEDS", "DIVIDENDS_RECEIVED_CF",
        "FINANCING_CASH_FLOW", "DEBT_PROCEEDS", "DEBT_REPAYMENTS",
        "LEASE_PAYMENTS", "DIVIDENDS_PAID", "CAPITAL_INCREASES_CASH",
        "TREASURY_TRANSACTIONS_CASH", "NET_CHANGE_IN_CASH",
        "OPENING_CASH", "CLOSING_CASH",
    ]
    table_rows = [["Metric", "FY 2023 (EGP mn)"]]
    for code in cf_codes:
        for m in data["metrics"]:
            if m[0] == code:
                table_rows.append([m[1], f"{m[2]:,.2f}"])
                break
    if len(table_rows) > 1:
        t = Table(table_rows, colWidths=[10 * cm, 5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightyellow),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        elems.append(t)
    elems.append(PageBreak())

    # Notes & Sector KPIs
    elems.append(Paragraph("Notes to the Financial Statements", style_h1))
    elems.append(Paragraph("Sector-Specific Operational KPIs", style_h2))
    elems.append(Spacer(1, 0.3 * cm))

    # Notes / KPIs section — any metric not yet shown above
    already_shown = set(balance_sheet_codes + income_codes + cf_codes)
    table_rows = [["Metric", "FY 2023", "Unit"]]
    for m in data["metrics"]:
        if m[0] in already_shown:
            continue
        if m[0].startswith("BANK_") or m[0].startswith("TELECOM_") or m[0].startswith("HEALTH_") or \
           m[0].startswith("FOOD_") or m[0].startswith("ENERGY_") or m[0].startswith("INDUSTRIAL_") or \
           m[0].startswith("REAL_ESTATE_") or m[0].startswith("REALESTATE_") or m[0].startswith("FINANCIAL_SERVICES_") or \
           m[0].startswith("INVESTMENT_HOLDING_"):
            unit = m[3] if len(m) > 3 else "EGP mn"
            table_rows.append([m[1], f"{m[2]:,.2f}", unit])
    if len(table_rows) > 1:
        t = Table(table_rows, colWidths=[10 * cm, 4 * cm, 2.5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.peachpuff),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        elems.append(t)
    elems.append(Spacer(1, 1 * cm))
    elems.append(Paragraph("End of Financial Statements", style_center))

    doc.build(elems)


def main():
    out_dir = Path("storage/test-pdfs")
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"=== Generating {len(COMPANY_DATA)} financial statement PDFs ===\n")
    for ticker, data in COMPANY_DATA.items():
        out_path = out_dir / f"{ticker}-FY2023.pdf"
        generate_pdf(ticker, data, out_path)
        size_kb = out_path.stat().st_size / 1024
        print(f"  ✓ {ticker:6} — {out_path} ({size_kb:.1f} KB, {len(data['metrics'])} metrics)")
    print(f"\n=== Done — {len(COMPANY_DATA)} PDFs in {out_dir}/ ===")


if __name__ == "__main__":
    main()
