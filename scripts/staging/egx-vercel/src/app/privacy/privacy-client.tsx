"use client"

import Link from "next/link"
import { LayoutShell } from "@/components/layout/LayoutShell"
import { useI18n } from "@/lib/i18n"

export default function PrivacyClient() {
  const { lang } = useI18n()
  const ar = lang === "ar"

  const sections = ar
    ? [
        {
          h: "1. من نحن",
          p: "EGX Financial Scanner منصة مستقلة لتحليل بيانات البورصة المصرية. نحن المتحكم في البيانات الشخصية التي تُجمع عبر الموقع. للتواصل بشأن الخصوصية: privacy@egx-scanner.com.",
        },
        {
          h: "2. البيانات التي نجمعها",
          p: "بيانات الحساب: البريد الإلكتروني، الاسم (اختياري)، وكلمة مرور مُخزّنة كتجزئة bcrypt. بيانات الجلسة: رمز جلسة عشوائي يُخزّن في ملف تعريف ارتباط HttpOnly. بيانات الاشتراك: خطة الاشتراك وحالة الطلب وسجل الدفع اليدوي. بيانات تقنية: عنوان IP ووكيل المستخدم ووقت الطلب لأغراض الأمان وتحديد المعدل ومنع إساءة الاستخدام. لا نجمع بيانات دفع حساسة (أرقام بطاقات) على خوادمنا.",
        },
        {
          h: "3. لماذا نستخدم البيانات",
          p: "لإنشاء الحساب وتوثيق الدخول، تقديم الخدمة والاشتراك، حماية الخدمة من إساءة الاستخدام والاحتيال، الرد على طلبات الدعم، والامتثال للالتزامات القانونية. لا نبيع البيانات الشخصية ولا نستخدمها لإعلانات سلوكية.",
        },
        {
          h: "4. الأساس القانوني",
          p: "نعالج البيانات لتنفيذ عقد الخدمة، ولمصالحنا المشروعة في الأمان ومنع الاحتيال، وللأساس القانوني حيث يقتضي القانون ذلك، وبموافقتك عند الحاجة. يمكنك سحب الموافقة في أي وقت دون أن يؤثر ذلك على المعالجة السابقة.",
        },
        {
          h: "5. المشاركة",
          p: "قد نشارك البيانات مع مزوّدي الاستضافة وقاعدة البيانات ومزوّدي البريد الذين يعالجونها نيابة عنا بموجب تعهدات سرية، ومع السلطات عندما يقتضي القانون. لا نشارك بيانات الحساب مع مزوّدي البيانات المالية.",
        },
        {
          h: "6. الاحتفاظ",
          p: "نحتفظ ببيانات الحساب طوال فترة نشاطه وبعدها للمدة اللازمة للامتثال القانوني وحل النزاعات. سجلات الأمان قصيرة الأجل. عند حذف الحساب تُحذف البيانات الشخصية أو تُجهَّل، مع الاحتفاظ بالسجلات المطلوبة قانوناً فقط.",
        },
        {
          h: "7. حقوقك",
          p: "لك الحق في الوصول إلى بياناتك وتصحيحها وحذفها وتقييد معالجتها والاعتراض عليها ونقلها حيث ينطبق القانون. أرسل طلبك إلى privacy@egx-scanner.com وسنرد خلال المدة القانونية. يمكنك أيضاً تقديم شكوى إلى الجهة المختصة.",
        },
        {
          h: "8. ملفات تعريف الارتباط",
          p: "نستخدم ملف تعريف ارتباط أساسياً للجلسة (HttpOnly، Secure، SameSite). لا نستخدم ملفات تعريف ارتباط إعلانية أو تتبعية من أطراف ثالثة. إذا أُضيف تحليل استخدام مستقبلاً فسنطلب الموافقة حيث يلزم.",
        },
        {
          h: "9. الأمان",
          p: "نستخدم تجزئة كلمات المرور bcrypt، ورموز جلسة عشوائية، وملفات تعريف ارتباط HttpOnly، وحدود معدل الطلبات، وضوابط وصول إدارية. لا يمكن ضمان أمان أي نظام بنسبة 100%، لكننا نراجع الضوابط ونحدّثها.",
        },
        {
          h: "10. الأطفال",
          p: "الخدمة غير موجهة لمن هم دون 18 عاماً. لا نجمع بياناتهم عن قصد. إذا اكتشفنا حساباً كذلك سنعلّقه ونحذف بياناته.",
        },
        {
          h: "11. التغييرات",
          p: "قد نحدّث هذه السياسة. سننشر التاريخ الجديد، ونُخطر المستخدمين بالتغييرات الجوهرية عبر البريد أو الموقع قبل سريانها.",
        },
        {
          h: "12. القانون الحاكم",
          p: "تُفسَّر هذه السياسة وفق قوانين جمهورية مصر العربية، بما في ذلك قانون حماية البيانات الشخصية رقم 151 لسنة 2020 حيث ينطبق. لا تُعد هذه السياسة نصيحة قانونية.",
        },
      ]
    : [
        {
          h: "1. Who we are",
          p: "EGX Financial Scanner is an independent Egyptian Exchange financial-analysis platform. We are the controller of personal data collected through the site. Privacy contact: privacy@egx-scanner.com.",
        },
        {
          h: "2. Data we collect",
          p: "Account data: email address, optional name, and a password stored as a bcrypt hash. Session data: a random session token stored in an HttpOnly cookie. Subscription data: plan, request status, and manual payment records. Technical data: IP address, user agent, and request time for security, rate limiting and abuse prevention. We do not collect sensitive card data on our servers.",
        },
        {
          h: "3. Why we use it",
          p: "To create and authenticate accounts, deliver the service and subscriptions, protect the service against abuse and fraud, respond to support requests, and meet legal obligations. We do not sell personal data and do not use it for behavioural advertising.",
        },
        {
          h: "4. Legal basis",
          p: "We process data to perform the service contract, for our legitimate interests in security and fraud prevention, to comply with law, and with your consent where required. You may withdraw consent at any time without affecting prior processing.",
        },
        {
          h: "5. Sharing",
          p: "We may share data with hosting, database and email providers acting on our behalf under confidentiality obligations, and with authorities where required by law. We do not share account data with financial-data providers.",
        },
        {
          h: "6. Retention",
          p: "Account data is kept while the account is active and afterwards for as long as needed for legal compliance and dispute resolution. Security logs are short-lived. On account deletion, personal data is deleted or anonymised, retaining only legally required records.",
        },
        {
          h: "7. Your rights",
          p: "You may access, correct, delete, restrict or object to processing, and request portability where applicable. Send requests to privacy@egx-scanner.com; we respond within the legal period. You may also complain to the competent authority.",
        },
        {
          h: "8. Cookies",
          p: "We use one essential session cookie (HttpOnly, Secure, SameSite). We do not use advertising or third-party tracking cookies. If usage analytics are added later, we will request consent where required.",
        },
        {
          h: "9. Security",
          p: "We use bcrypt password hashing, random session tokens, HttpOnly cookies, request rate limits, and administrative access controls. No system can be guaranteed 100% secure, but we review and update these controls.",
        },
        {
          h: "10. Children",
          p: "The service is not directed at anyone under 18. We do not knowingly collect their data. If we discover such an account, we will suspend it and delete the data.",
        },
        {
          h: "11. Changes",
          p: "We may update this policy. We will publish the new date and notify users of material changes by email or on the site before they take effect.",
        },
        {
          h: "12. Governing law",
          p: "This policy is interpreted under the laws of the Arab Republic of Egypt, including the Personal Data Protection Law No. 151 of 2020 where applicable. This policy is not legal advice.",
        },
      ]

  return (
    <LayoutShell>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{ar ? "سياسة الخصوصية" : "Privacy Policy"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {ar ? "آخر تحديث: 3 نوفمبر 2026" : "Last updated: 3 November 2026"}
          </p>
        </div>
        <div className="space-y-5">
          {sections.map((s) => (
            <section key={s.h} className="space-y-1.5">
              <h2 className="text-sm font-semibold">{s.h}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>
        <div className="border-t border-border/60 pt-4 text-sm">
          <Link href="/" className="text-primary underline underline-offset-2 hover:text-primary/80">
            {ar ? "العودة إلى الرئيسية" : "Back to home"}
          </Link>
        </div>
      </div>
    </LayoutShell>
  )
}
