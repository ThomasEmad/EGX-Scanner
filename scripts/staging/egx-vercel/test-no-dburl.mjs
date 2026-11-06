// اختبار: هل PrismaClient يعمل مع adapter بدون DATABASE_URL أصلاً؟
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const adapter = new PrismaLibSQL({
  url: process.env.TU_URL,
  authToken: process.env.TU_TOKEN,
});
const db = new PrismaClient({ adapter });
const count = await db.company.count();
console.log('NO_DATABASE_URL_MODE: company count =', count);
const t = await db.user.count();
console.log('user count =', t);
console.log('ADAPTER_WITHOUT_DATABASE_URL_OK');
