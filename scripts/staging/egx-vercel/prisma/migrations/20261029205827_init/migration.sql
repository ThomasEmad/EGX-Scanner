-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "isin" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "sector" TEXT NOT NULL,
    "industry" TEXT,
    "listingStatus" TEXT NOT NULL DEFAULT 'LISTED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "sharesOutstanding" REAL,
    "website" TEXT,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "egxCategory" TEXT,
    "sourceUrl" TEXT,
    "irUrl" TEXT,
    "lastVerifiedAt" DATETIME,
    "originalTicker" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "sourceName" TEXT NOT NULL,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "statementType" TEXT NOT NULL DEFAULT 'CONSOLIDATED',
    "fiscalYear" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME NOT NULL,
    "publicationDate" DATETIME,
    "language" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "localFileRef" TEXT,
    "fileName" TEXT,
    "fileHash" TEXT,
    "fileSize" INTEGER,
    "processingStatus" TEXT NOT NULL DEFAULT 'NEW_DOWNLOADED',
    "extractionMethod" TEXT,
    "parserVersion" TEXT,
    "extractionConfidence" REAL,
    "errorMessage" TEXT,
    "uploadedBy" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isRestatement" BOOLEAN NOT NULL DEFAULT false,
    "supersedesId" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "notes" TEXT,
    "discoveredAt" DATETIME,
    "documentType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetricDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT,
    "statementType" TEXT NOT NULL,
    "description" TEXT,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "appliesToSectors" TEXT,
    "calcRole" TEXT NOT NULL DEFAULT 'INPUT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "group" TEXT,
    "displayOrder" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FinancialValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "metricCode" TEXT NOT NULL,
    "originalLabel" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "unit" TEXT NOT NULL DEFAULT 'MILLION',
    "normalizedValue" REAL NOT NULL,
    "statementType" TEXT NOT NULL,
    "group" TEXT,
    "subPeriod" TEXT DEFAULT 'CURRENT',
    "isRestated" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER,
    "sourceTable" INTEGER,
    "sourceRow" INTEGER,
    "sourceCol" INTEGER,
    "sourceBbox" TEXT,
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "validationNotes" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "originalValue" REAL,
    "isManuallyCorrected" BOOLEAN NOT NULL DEFAULT false,
    "correctedBy" TEXT,
    "correctedAt" DATETIME,
    "correctionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialValue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialValidationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "checkName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "details" TEXT,
    "discrepancy" REAL,
    "discrepancyPct" REAL,
    "expectedValue" REAL,
    "actualValue" REAL,
    "affectedFields" TEXT,
    "sourcePages" TEXT,
    "diagnosticReason" TEXT,
    "toleranceApplied" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialValidationResult_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialExtractionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialExtractionLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "periodKey" TEXT,
    "content" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "inputSummary" TEXT,
    "model" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAnalysis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalculatedMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "value" REAL,
    "valueStatus" TEXT NOT NULL DEFAULT 'OK',
    "statusDetail" TEXT,
    "formulaVersion" TEXT NOT NULL,
    "sourcePeriods" TEXT NOT NULL DEFAULT '[]',
    "statementType" TEXT NOT NULL DEFAULT 'CONSOLIDATED',
    "formula" TEXT,
    "calculationType" TEXT NOT NULL DEFAULT 'ANALYST_CALCULATED',
    "sourceMetricCodes" TEXT,
    "sourceDocumentIds" TEXT,
    "isDerived" BOOLEAN NOT NULL DEFAULT false,
    "trendType" TEXT,
    "trendPeriodsCount" INTEGER,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalculatedMetric_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "currentPeriodKey" TEXT NOT NULL,
    "previousPeriodKey" TEXT,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "explanationEn" TEXT NOT NULL,
    "explanationAr" TEXT,
    "ruleVersion" TEXT NOT NULL DEFAULT 'events@1',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dividend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "announcementDate" DATETIME,
    "eligibilityDate" DATETIME,
    "exDividendDate" DATETIME,
    "distributionDate" DATETIME,
    "dividendPerShare" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "dividendType" TEXT NOT NULL DEFAULT 'CASH',
    "status" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dividend_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScannerRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "presetKey" TEXT,
    "conditions" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScannerRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT,
    "ruleName" TEXT NOT NULL,
    "ruleSnapshot" TEXT NOT NULL,
    "periodBasis" TEXT NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCompanyIds" TEXT NOT NULL DEFAULT '[]',
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScannerRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ScannerRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DebtInstrument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "instrumentName" TEXT,
    "instrumentType" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isSecured" BOOLEAN,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "principalAmount" REAL,
    "principalEgp" REAL,
    "interestRatePct" REAL,
    "maturityDate" DATETIME,
    "maturityYears" REAL,
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DebtInstrument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DebtInstrument_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SegmentDisclosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "segmentType" TEXT NOT NULL,
    "segmentName" TEXT NOT NULL,
    "segmentNameAr" TEXT,
    "metricCode" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "unit" TEXT NOT NULL DEFAULT 'MILLION',
    "normalizedValue" REAL NOT NULL,
    "subPeriod" TEXT NOT NULL DEFAULT 'CURRENT',
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SegmentDisclosure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SegmentDisclosure_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FairValueMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT,
    "openingBalance" REAL,
    "purchases" REAL,
    "sales" REAL,
    "fairValueGains" REAL,
    "transfersIn" REAL,
    "transfersOut" REAL,
    "fxRevaluation" REAL,
    "closingBalance" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "unit" TEXT NOT NULL DEFAULT 'MILLION',
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FairValueMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FairValueMovement_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentDisclosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "investeeName" TEXT NOT NULL,
    "investeeNameAr" TEXT,
    "relationship" TEXT NOT NULL,
    "ownershipPct" REAL,
    "carryingValue" REAL,
    "shareOfProfit" REAL,
    "shareOfOci" REAL,
    "dividendsReceived" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "unit" TEXT NOT NULL DEFAULT 'MILLION',
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentDisclosure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentDisclosure_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RelatedPartyTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "counterpartyNameAr" TEXT,
    "relationship" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "amount" REAL,
    "balanceReceivable" REAL,
    "balancePayable" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "unit" TEXT NOT NULL DEFAULT 'MILLION',
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelatedPartyTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RelatedPartyTransaction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContingencyDisclosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL,
    "amountStatus" TEXT NOT NULL DEFAULT 'DISCLOSED',
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "unit" TEXT NOT NULL DEFAULT 'MILLION',
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContingencyDisclosure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContingencyDisclosure_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShareMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "movementDate" DATETIME,
    "sharesBefore" REAL,
    "sharesMoved" REAL NOT NULL,
    "sharesAfter" REAL,
    "pricePerShare" REAL,
    "totalValue" REAL,
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "isDemoData" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShareMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShareMovement_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataQualityScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "completenessScore" REAL,
    "confidenceScore" REAL,
    "validationScore" REAL,
    "reconciliationScore" REAL,
    "sourceCoverageScore" REAL,
    "overallScore" REAL,
    "unresolvedFieldsCount" INTEGER NOT NULL DEFAULT 0,
    "ambiguousFieldsCount" INTEGER NOT NULL DEFAULT 0,
    "missingCriticalFieldsCount" INTEGER NOT NULL DEFAULT 0,
    "reconciliationFailuresCount" INTEGER NOT NULL DEFAULT 0,
    "missingMetrics" TEXT,
    "lowConfidenceMetrics" TEXT,
    "failedChecks" TEXT,
    "engineVersion" TEXT NOT NULL DEFAULT 'data-quality@1',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DataQualityScore_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DataQualityScore_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FinancialReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "sourceAdapter" TEXT NOT NULL,
    "companyFilter" TEXT,
    "periodFrom" INTEGER,
    "periodTo" INTEGER,
    "companiesProcessed" INTEGER NOT NULL DEFAULT 0,
    "documentsFound" INTEGER NOT NULL DEFAULT 0,
    "documentsDownloaded" INTEGER NOT NULL DEFAULT 0,
    "documentsProcessed" INTEGER NOT NULL DEFAULT 0,
    "documentsFailed" INTEGER NOT NULL DEFAULT 0,
    "valuesExtracted" INTEGER NOT NULL DEFAULT 0,
    "validationErrors" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IngestionError" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingestionRunId" TEXT,
    "companyId" TEXT,
    "reportId" TEXT,
    "sourceAdapter" TEXT,
    "sourceUrl" TEXT,
    "stage" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "errorStack" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetriedAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngestionError_ingestionRunId_fkey" FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PortfolioHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "avgCost" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortfolioHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortfolioHolding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "features" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "activatedAt" DATETIME,
    "activatedBy" TEXT,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "paymentMethod" TEXT NOT NULL DEFAULT 'MANUAL_TRANSFER',
    "transactionReference" TEXT,
    "proofFile" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "adminNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SmartAnalysisUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "resetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SmartAnalysisUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationSec" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "companiesChecked" INTEGER NOT NULL DEFAULT 0,
    "issuesFound" INTEGER NOT NULL DEFAULT 0,
    "issuesFixed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running'
);

-- CreateTable
CREATE TABLE "AuditIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "metricCode" TEXT,
    "period" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "currentValue" TEXT,
    "expectedValue" TEXT,
    "source" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'open',
    "fixedAt" DATETIME,
    "fixedBy" TEXT,
    "fixNote" TEXT,
    CONSTRAINT "AuditIssue_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyConfidenceScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "rating" TEXT NOT NULL,
    "breakdownJson" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auditRunId" TEXT NOT NULL,
    CONSTRAINT "CompanyConfidenceScore_ticker_fkey" FOREIGN KEY ("ticker") REFERENCES "Company" ("ticker") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataQualityAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" TEXT,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_ticker_key" ON "Company"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "Company_isin_key" ON "Company"("isin");

-- CreateIndex
CREATE INDEX "Company_sector_idx" ON "Company"("sector");

-- CreateIndex
CREATE INDEX "Company_isActive_idx" ON "Company"("isActive");

-- CreateIndex
CREATE INDEX "MarketPrice_companyId_asOf_idx" ON "MarketPrice"("companyId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPrice_companyId_asOf_key" ON "MarketPrice"("companyId", "asOf");

-- CreateIndex
CREATE INDEX "FinancialReport_companyId_processingStatus_idx" ON "FinancialReport"("companyId", "processingStatus");

-- CreateIndex
CREATE INDEX "FinancialReport_processingStatus_idx" ON "FinancialReport"("processingStatus");

-- CreateIndex
CREATE INDEX "FinancialReport_companyId_statementType_idx" ON "FinancialReport"("companyId", "statementType");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialReport_companyId_periodType_periodLabel_statementType_version_key" ON "FinancialReport"("companyId", "periodType", "periodLabel", "statementType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDefinition_code_key" ON "MetricDefinition"("code");

-- CreateIndex
CREATE INDEX "FinancialValue_companyId_metricCode_idx" ON "FinancialValue"("companyId", "metricCode");

-- CreateIndex
CREATE INDEX "FinancialValue_validationStatus_idx" ON "FinancialValue"("validationStatus");

-- CreateIndex
CREATE INDEX "FinancialValue_companyId_statementType_group_idx" ON "FinancialValue"("companyId", "statementType", "group");

-- CreateIndex
CREATE INDEX "FinancialValue_companyId_group_idx" ON "FinancialValue"("companyId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialValue_reportId_metricCode_subPeriod_key" ON "FinancialValue"("reportId", "metricCode", "subPeriod");

-- CreateIndex
CREATE INDEX "FinancialValidationResult_reportId_idx" ON "FinancialValidationResult"("reportId");

-- CreateIndex
CREATE INDEX "FinancialValidationResult_status_severity_idx" ON "FinancialValidationResult"("status", "severity");

-- CreateIndex
CREATE INDEX "FinancialValidationResult_checkName_idx" ON "FinancialValidationResult"("checkName");

-- CreateIndex
CREATE INDEX "FinancialExtractionLog_reportId_idx" ON "FinancialExtractionLog"("reportId");

-- CreateIndex
CREATE INDEX "AiAnalysis_companyId_createdAt_idx" ON "AiAnalysis"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CalculatedMetric_companyId_periodKey_idx" ON "CalculatedMetric"("companyId", "periodKey");

-- CreateIndex
CREATE INDEX "CalculatedMetric_code_idx" ON "CalculatedMetric"("code");

-- CreateIndex
CREATE INDEX "CalculatedMetric_calculationType_idx" ON "CalculatedMetric"("calculationType");

-- CreateIndex
CREATE INDEX "CalculatedMetric_isDerived_idx" ON "CalculatedMetric"("isDerived");

-- CreateIndex
CREATE UNIQUE INDEX "CalculatedMetric_companyId_code_periodKey_statementType_key" ON "CalculatedMetric"("companyId", "code", "periodKey", "statementType");

-- CreateIndex
CREATE INDEX "FinancialEvent_eventType_idx" ON "FinancialEvent"("eventType");

-- CreateIndex
CREATE INDEX "FinancialEvent_companyId_idx" ON "FinancialEvent"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvent_companyId_eventType_currentPeriodKey_key" ON "FinancialEvent"("companyId", "eventType", "currentPeriodKey");

-- CreateIndex
CREATE INDEX "Dividend_status_idx" ON "Dividend"("status");

-- CreateIndex
CREATE INDEX "Dividend_companyId_idx" ON "Dividend"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerRule_name_key" ON "ScannerRule"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerRule_presetKey_key" ON "ScannerRule"("presetKey");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_name_key" ON "DataSource"("name");

-- CreateIndex
CREATE INDEX "DebtInstrument_companyId_reportId_idx" ON "DebtInstrument"("companyId", "reportId");

-- CreateIndex
CREATE INDEX "DebtInstrument_companyId_instrumentType_isCurrent_idx" ON "DebtInstrument"("companyId", "instrumentType", "isCurrent");

-- CreateIndex
CREATE INDEX "SegmentDisclosure_companyId_segmentType_idx" ON "SegmentDisclosure"("companyId", "segmentType");

-- CreateIndex
CREATE INDEX "SegmentDisclosure_companyId_segmentName_idx" ON "SegmentDisclosure"("companyId", "segmentName");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentDisclosure_reportId_segmentType_segmentName_metricCode_subPeriod_key" ON "SegmentDisclosure"("reportId", "segmentType", "segmentName", "metricCode", "subPeriod");

-- CreateIndex
CREATE INDEX "FairValueMovement_companyId_category_level_idx" ON "FairValueMovement"("companyId", "category", "level");

-- CreateIndex
CREATE INDEX "FairValueMovement_reportId_idx" ON "FairValueMovement"("reportId");

-- CreateIndex
CREATE INDEX "InvestmentDisclosure_companyId_relationship_idx" ON "InvestmentDisclosure"("companyId", "relationship");

-- CreateIndex
CREATE INDEX "InvestmentDisclosure_reportId_idx" ON "InvestmentDisclosure"("reportId");

-- CreateIndex
CREATE INDEX "RelatedPartyTransaction_companyId_counterpartyName_idx" ON "RelatedPartyTransaction"("companyId", "counterpartyName");

-- CreateIndex
CREATE INDEX "RelatedPartyTransaction_reportId_transactionType_idx" ON "RelatedPartyTransaction"("reportId", "transactionType");

-- CreateIndex
CREATE INDEX "ContingencyDisclosure_companyId_type_idx" ON "ContingencyDisclosure"("companyId", "type");

-- CreateIndex
CREATE INDEX "ContingencyDisclosure_reportId_idx" ON "ContingencyDisclosure"("reportId");

-- CreateIndex
CREATE INDEX "ShareMovement_companyId_movementType_idx" ON "ShareMovement"("companyId", "movementType");

-- CreateIndex
CREATE INDEX "ShareMovement_reportId_idx" ON "ShareMovement"("reportId");

-- CreateIndex
CREATE INDEX "DataQualityScore_companyId_overallScore_idx" ON "DataQualityScore"("companyId", "overallScore");

-- CreateIndex
CREATE INDEX "DataQualityScore_overallScore_idx" ON "DataQualityScore"("overallScore");

-- CreateIndex
CREATE UNIQUE INDEX "DataQualityScore_reportId_key" ON "DataQualityScore"("reportId");

-- CreateIndex
CREATE INDEX "IngestionRun_status_idx" ON "IngestionRun"("status");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceAdapter_idx" ON "IngestionRun"("sourceAdapter");

-- CreateIndex
CREATE INDEX "IngestionRun_startedAt_idx" ON "IngestionRun"("startedAt");

-- CreateIndex
CREATE INDEX "IngestionError_ingestionRunId_idx" ON "IngestionError"("ingestionRunId");

-- CreateIndex
CREATE INDEX "IngestionError_companyId_idx" ON "IngestionError"("companyId");

-- CreateIndex
CREATE INDEX "IngestionError_stage_errorType_idx" ON "IngestionError"("stage", "errorType");

-- CreateIndex
CREATE INDEX "IngestionError_resolvedAt_idx" ON "IngestionError"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "PortfolioHolding_userId_idx" ON "PortfolioHolding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioHolding_userId_companyId_key" ON "PortfolioHolding"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_token_key" ON "AdminSession"("token");

-- CreateIndex
CREATE INDEX "AdminSession_token_idx" ON "AdminSession"("token");

-- CreateIndex
CREATE INDEX "Plan_isActive_idx" ON "Plan"("isActive");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_userId_endDate_idx" ON "Subscription"("userId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "PaymentRequest_userId_status_idx" ON "PaymentRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "PaymentRequest_status_createdAt_idx" ON "PaymentRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SmartAnalysisUsage_userId_year_month_idx" ON "SmartAnalysisUsage"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SmartAnalysisUsage_userId_year_month_key" ON "SmartAnalysisUsage"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "AuditRun_startedAt_idx" ON "AuditRun"("startedAt");

-- CreateIndex
CREATE INDEX "AuditRun_status_idx" ON "AuditRun"("status");

-- CreateIndex
CREATE INDEX "AuditIssue_ticker_category_status_idx" ON "AuditIssue"("ticker", "category", "status");

-- CreateIndex
CREATE INDEX "AuditIssue_severity_status_idx" ON "AuditIssue"("severity", "status");

-- CreateIndex
CREATE INDEX "AuditIssue_auditRunId_idx" ON "AuditIssue"("auditRunId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyConfidenceScore_ticker_key" ON "CompanyConfidenceScore"("ticker");

-- CreateIndex
CREATE INDEX "CompanyConfidenceScore_score_idx" ON "CompanyConfidenceScore"("score");

-- CreateIndex
CREATE INDEX "CompanyConfidenceScore_auditRunId_idx" ON "CompanyConfidenceScore"("auditRunId");

-- CreateIndex
CREATE INDEX "DataQualityAuditLog_auditRunId_idx" ON "DataQualityAuditLog"("auditRunId");

-- CreateIndex
CREATE INDEX "DataQualityAuditLog_entityType_entityId_idx" ON "DataQualityAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "DataQualityAuditLog_action_idx" ON "DataQualityAuditLog"("action");
