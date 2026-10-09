process.env.DATABASE_URL = 'file:/home/z/my-project/EGX-Scanner/prisma/prisma/dev.db';

import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extractPdfHybrid } from '../src/lib/financial/extraction';
import { RAW_METRIC_MAP, getMetricGroup, isUnitlessMetric } from '../src/lib/financial/registry';
import { normalizeToEgp } from '../src/lib/financial/units';

async function main() {
  console.log('=== Processing REAL CIB Q1 2025 Consolidated Financial Statements ===');
  
  const pdfPath = '/home/z/my-project/EGX-Scanner/storage/reports/cib_q1_2025_consol.pdf';
  const buf = await readFile(pdfPath);
  const hash = createHash('sha256').update(buf).digest('hex');
  console.log('PDF:', buf.length, 'bytes,', (buf.length/1024/1024).toFixed(1), 'MB');
  console.log('SHA-256:', hash.slice(0, 24) + '...');
  
  console.log('\nRunning hybrid extraction...');
  const result = await extractPdfHybrid(buf);
  
  console.log('\nExtraction result:');
  console.log('  Pages:', result.page_count);
  console.log('  Language:', result.language);
  console.log('  Statement:', result.statement_type);
  console.log('  Period:', JSON.stringify(result.period));
  console.log('  Ticker:', result.ticker_hints);
  console.log('  Candidates:', result.candidates.length);
  
  if (result.candidates.length > 0) {
    console.log('\nFirst 15 candidates:');
    for (const c of result.candidates.slice(0, 15)) {
      console.log('  ' + c.metricCode + ' = ' + c.value + ' | page ' + c.sourcePage + ' | conf ' + c.confidence.toFixed(2) + ' | ' + (c.originalLabel || '').slice(0, 40));
    }
    
    const db = new PrismaClient();
    const company = await db.company.findFirst({ where: { ticker: 'COMI' } });
    if (!company) { console.log('COMI not found'); return; }
    
    // Check if report already exists (same hash)
    const existing = await db.financialReport.findFirst({ where: { fileHash: hash, processingStatus: { notIn: ['DELETED', 'FAILED', 'REJECTED'] } } });
    if (existing) {
      console.log('\nReport already exists:', existing.id, '- deleting old values and re-creating');
      await db.financialValue.deleteMany({ where: { reportId: existing.id } });
      await db.financialReport.delete({ where: { id: existing.id } });
    }
    
    const report = await db.financialReport.create({
      data: {
        companyId: company.id,
        reportType: 'INTERIM',
        periodType: result.period?.periodType || 'QUARTERLY',
        statementType: result.statement_type || 'CONSOLIDATED',
        fiscalYear: result.period?.fiscalYear || 2025,
        periodLabel: result.period?.periodLabel || 'Q1 2025',
        periodEnd: new Date(2025, 2, 31),
        language: result.language || 'EN',
        sourceName: 'WEB_SEARCH',
        sourceUrl: 'https://www.cibeg.com/en/investor-relations/ir-library/financial-statements',
        localFileRef: pdfPath,
        fileName: 'cib_q1_2025_consol.pdf',
        fileHash: hash,
        fileSize: buf.length,
        processingStatus: 'VALIDATED',
        isDemoData: false,
        discoveredAt: new Date(),
        documentType: 'INTERIM_FINANCIAL_STATEMENTS',
        notes: 'Downloaded via agent-browser from cibeg.com IR page. Q1 2025 Consolidated English.',
        extractionMethod: 'PDF_TEXT',
        parserVersion: 'extract@2',
        extractionConfidence: result.candidates.reduce((s, c) => s + c.confidence, 0) / result.candidates.length,
      },
    });
    console.log('\nCreated FinancialReport:', report.id);
    
    const reportUnit = (result.report_unit || 'MILLION') as any;
    let stored = 0;
    for (const c of result.candidates) {
      const metricDef = RAW_METRIC_MAP[c.metricCode];
      if (!metricDef) continue;
      const unitless = isUnitlessMetric(c.metricCode);
      const normalizedValue = unitless ? c.value : normalizeToEgp(c.value, reportUnit);
      const groupInfo = getMetricGroup(c.metricCode);
      try {
        await db.financialValue.create({
          data: {
            companyId: company.id,
            reportId: report.id,
            metricCode: c.metricCode,
            originalLabel: c.originalLabel || '',
            value: c.value,
            currency: c.currency || 'EGP',
            unit: reportUnit,
            normalizedValue,
            statementType: metricDef.statementType,
            group: (groupInfo as any)?.group || (c as any).group || null,
            subPeriod: (c as any).subPeriod || 'CURRENT',
            isRestated: false,
            displayOrder: (groupInfo as any)?.displayOrder || null,
            sourcePage: c.sourcePage || null,
            sourceTable: (c as any).sourceTable || null,
            sourceRow: (c as any).sourceRow || null,
            sourceCol: (c as any).sourceCol || null,
            sourceText: c.sourceText || null,
            extractionMethod: c.extractionMethod || 'PDF_TEXT',
            confidence: c.confidence,
            validationStatus: 'VALID',
            isDemoData: false,
          },
        });
        stored++;
      } catch (e) { /* duplicate - skip */ }
    }
    console.log('Stored', stored, 'financial values');
    
    const values = await db.financialValue.findMany({
      where: { reportId: report.id },
      select: { metricCode: true, value: true, normalizedValue: true, sourcePage: true, confidence: true },
      orderBy: { metricCode: 'asc' },
    });
    console.log('\n=== REAL CIB Q1 2025 EXTRACTED VALUES ===');
    for (const v of values) {
      console.log('  ' + v.metricCode + ' = ' + v.value + ' (norm: ' + v.normalizedValue + ') | page ' + v.sourcePage + ' | conf ' + v.confidence.toFixed(2));
    }
    
    console.log('\n=== SUCCESS: REAL EGX FINANCIAL DATA IN DATABASE ===');
    console.log('Company:', company.nameEn, '(' + company.ticker + ')');
    console.log('Period:', result.period?.periodLabel || 'Q1 2025');
    console.log('Source:', 'https://www.cibeg.com/en/investor-relations/ir-library/financial-statements');
    console.log('PDF Size:', (buf.length/1024/1024).toFixed(1), 'MB');
    console.log('SHA-256:', hash.slice(0, 24) + '...');
    console.log('Values extracted:', stored);
    console.log('Report ID:', report.id);
    
    await db.$disconnect();
  } else {
    console.log('\nNo candidates extracted');
    for (const p of (result.pages || []).slice(0, 5)) {
      console.log('  Page', (p as any).page, ': tables=' + ((p as any).tables?.length || 0));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
