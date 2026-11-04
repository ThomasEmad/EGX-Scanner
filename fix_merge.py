import re
with open('C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/scripts/merge-dbs.mjs', 'r', encoding='utf8') as f:
    content = f.read()

old = "const nestedCalcKeys = new Set(nestedCalc.map(c => \`${c.companyId}|\${c.code}|\${c.fiscalYear}|\${c.periodType}|\${c.periodLabel ?? 'NULL'}\`))"
new = "const nestedCalcKeys = new Set(nestedCalc.map(c => \`${c.companyId}|\${c.code}|\${c.periodType}:\${c.fiscalYear}:\${c.periodLabel ?? ''}|\${c.statementType}\`))"

content = content.replace(old, new)

with open('C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/scripts/merge-dbs.mjs', 'w', encoding='utf8') as f:
    f.write(content)
print('Done')