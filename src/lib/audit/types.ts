// Core types for the Data Quality Audit System
// Per DATA-AUDIT-PROMPT.md specification

export type AuditCategory =
  | 'accounting'
  | 'logical'
  | 'temporal'
  | 'cross_source'
  | 'missing'
  | 'outlier'
  | 'provenance'
  | 'sector';

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low';

export type IssueStatus = 'open' | 'auto_fixed' | 'manually_fixed' | 'wont_fix';

export type AuditRunType = 'daily' | 'weekly' | 'manual';

export type AuditRunStatus = 'running' | 'completed' | 'failed';

export interface AuditRun {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  durationSec?: number;
  type: AuditRunType;
  companiesChecked: number;
  issuesFound: number;
  issuesFixed: number;
  status: AuditRunStatus;
}

export interface AuditIssue {
  id: string;
  auditRunId: string;
  ticker: string;
  metricCode?: string;
  period?: string;
  category: AuditCategory;
  severity: AuditSeverity;
  description: string;
  descriptionAr?: string;
  currentValue?: string;
  expectedValue?: string;
  source?: string;
  detectedAt: Date;
  status: IssueStatus;
  fixedAt?: Date;
  fixedBy?: string;
  fixNote?: string;
}

export interface CompanyConfidenceScore {
  ticker: string;
  score: number; // 0-100
  rating: 'high' | 'medium' | 'low' | 'critical';
  breakdown: ConfidenceBreakdown;
  computedAt: Date;
  auditRunId: string;
}

export interface ConfidenceBreakdown {
  coverage: number;          // 0-100: critical metric coverage
  violations: number;        // accounting violations penalty
  conflicts: number;         // cross-source conflicts penalty
  anomalies: number;         // temporal anomalies penalty
  stale: number;             // stale data penalty
  sourceDiversity: number;   // single source penalty
  isin: number;              // placeholder ISIN penalty
}

export interface AuditCheckResult {
  checkName: string;
  category: AuditCategory;
  severity: AuditSeverity;
  passed: boolean;
  details: string;
  detailsAr?: string;
  ticker: string;
  metricCode?: string;
  period?: string;
  currentValue?: number | string;
  expectedValue?: number | string;
  source?: string;
  autoFixable: boolean;
  autoFixAction?: string;
}

export interface CompanyAuditReport {
  ticker: string;
  nameEn: string;
  nameAr?: string;
  sector: string;
  auditRunId: string;
  auditDate: Date;
  confidenceScore: number;
  confidenceRating: 'high' | 'medium' | 'low' | 'critical';
  latestDataPeriod: string;
  latestDataAgeMonths: number;
  sources: string[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    autoFixed: number;
    manualReview: number;
  };
  issues: AuditIssue[];
  checksPassed: string[];
  recommendations: string[];
}

export interface AggregateAuditReport {
  auditRunId: string;
  auditDate: Date;
  durationSec: number;
  coverage: {
    companiesAudited: number;
    totalRecords: number;
    recordsChecked: number;
    checkRate: number;
  };
  findingsBySeverity: {
    critical: { count: number; autoFixed: number; manual: number };
    high: { count: number; autoFixed: number; manual: number };
    medium: { count: number; autoFixed: number; manual: number };
    low: { count: number; autoFixed: number; manual: number };
    total: { count: number; autoFixed: number; manual: number };
  };
  topCriticalIssues: Array<{
    rank: number;
    severity: 'critical';
    description: string;
    affectedCount: number;
    ticker?: string;
  }>;
  topIssuesByAffected: Array<{
    rank: number;
    description: string;
    affectedCount: number;
    category: AuditCategory;
  }>;
  confidenceDistribution: {
    high: number;    // 80-100
    medium: number;  // 60-79
    low: number;     // 30-59
    critical: number; // 0-29
  };
  companiesNeedingAttention: Array<{
    ticker: string;
    nameEn: string;
    confidence: number;
    topIssues: string[];
  }>;
  sourceHealth: Array<{
    source: string;
    issueCount: number;
    topIssueTypes: string[];
  }>;
}

export interface FinancialDataPoint {
  ticker: string;
  metricCode: string;
  period: string;
  periodType: 'ANNUAL' | 'QUARTERLY' | 'SEMIANNUAL' | 'NINE_MONTH' | 'TTM' | 'LTM';
  fiscalYear: number;
  value: number;
  normalizedValue: number;
  currency: string;
  unit: string;
  sourceName: string;
  sourceUrl?: string;
  extractedAt: Date;
  confidence: number;
  validationStatus: 'VALID' | 'NEEDS_REVIEW' | 'FAILED' | 'PENDING';
}

export interface PivotedFinancials {
  [ticker: string]: {
    [period: string]: {
      [metricCode: string]: FinancialDataPoint;
    };
  };
}

export const SEVERITY_WEIGHTS: Record<AuditSeverity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 1,
};

export const CATEGORY_LABELS: Record<AuditCategory, { en: string; ar: string }> = {
  accounting: { en: 'Accounting Identity', ar: 'الهويات المحاسبية' },
  logical: { en: 'Logical Consistency', ar: 'الاتساق المنطقي' },
  temporal: { en: 'Temporal Anomalies', ar: 'الشذوذ الزمني' },
  cross_source: { en: 'Cross-Source Conflicts', ar: 'التعارض بين المصادر' },
  missing: { en: 'Missing Critical Data', ar: 'البيانات الناقصة الحرجة' },
  outlier: { en: 'Outliers & Extreme Values', ar: 'القيم المتطرفة' },
  provenance: { en: 'Provenance & Source Issues', ar: 'قضايا المنشأ والمصادر' },
  sector: { en: 'Sector-Specific Checks', ar: 'فحوصات القطاعية' },
};

export const SEVERITY_LABELS: Record<AuditSeverity, { en: string; ar: string }> = {
  critical: { en: 'CRITICAL', ar: 'حرج' },
  high: { en: 'HIGH', ar: 'عالي' },
  medium: { en: 'MEDIUM', ar: 'متوسط' },
  low: { en: 'LOW', ar: 'منخفض' },
};

export const CONFIDENCE_RATING_THRESHOLDS = {
  high: 80,
  medium: 60,
  low: 30,
  critical: 0,
} as const;