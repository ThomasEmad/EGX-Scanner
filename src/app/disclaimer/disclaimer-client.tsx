"use client"

import { ShieldAlert } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import Link from "next/link"

export default function DisclaimerClient() {
  const { t, lang } = useI18n()

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-amber-600" />
        <h1 className="text-2xl font-bold">{lang === "ar" ? "إخلاء المسؤولية" : "Disclaimer"}</h1>
      </div>

      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          {lang === "ar"
            ? "EGX Financial Scanner يقدم بيانات مالية ومؤشرات تحليلية لأغراض معلوماتية فقط. لا يعتبر أي من المحتوى الموجود على هذا الموقع نصيحة استثمارية أو عرضاً أو طلباً لشراء أو بيع أي أوراق مالية."
            : "EGX Financial Scanner provides financial data and analytical indicators for informational purposes only. Nothing on this site constitutes investment advice, or an offer or solicitation to buy or sell any securities."}
        </p>
        <p>
          {lang === "ar"
            ? "البيانات المالية مستمدة من مصادر عامة وقد تحتوي على أخطاء أو تأخير أو نقص. نحن لا نضمن دقة أو اكتمال أو ملاءمة أي من البيانات أو التحليلات."
            : "Financial data is sourced from public disclosures and may contain errors, delays, or omissions. We do not guarantee the accuracy, completeness, or suitability of any data or analysis."}
        </p>
        <p>
          {lang === "ar"
            ? "المستخدم هو المسول الوحيد عن قراراته الاستثمارية. استشر مستشاراً مالياً مرخصاً قبل اتخاذ أي قرار استثماري."
            : "Users are solely responsible for their investment decisions. Consult a licensed financial advisor before making any investment decision."}
        </p>
        <p>
          {lang === "ar"
            ? "قد تحتوي الحسابات المحسوبة (مثل نسبة السعر إلى الأرباح، العائد على Equity) على افتراضات وقد لا تعكس القيم الفعلية بدقة."
            : "Calculated metrics (such as P/E, ROE, market cap) involve assumptions and may not precisely reflect actual values."}
        </p>
        <p>
          {lang === "ar"
            ? "لا نتحمل أي مسؤولية عن أي خسائر قد تنتج عن استخدام هذا الموقع أو الاعتماد على محتواه."
            : "We are not liable for any losses arising from the use of this site or reliance on its content."}
        </p>
      </div>

      <div className="pt-4 border-t">
        <Link href="/" className="text-sm text-primary underline underline-offset-2 hover:text-primary/80">
          {lang === "ar" ? "العودة إلى الرئيسية" : "Back to home"}
        </Link>
      </div>
    </div>
  )
}
