# تقرير الحماية والانتقال للإنتاج

## ما كان موجودًا قبل المراجعة (تم التحقق منه ولم يُغيَّر)
| البند | الحالة |
|---|---|
| Parameterized queries | كل الاستعلامات `?`/`@name`. الاستثناءات الوحيدة (أسماء أعمدة في `UPDATE`) تأتي من قوائم بيضاء ثابتة في الكود وليست من المدخلات. يغطيها `tests/security/sql_injection.test.js` |
| Rate limiting | موجود في `api-server` و`central-server` و`lanServer` و`load-balancer`: 600 طلب/دقيقة لكل IP، و5 عمليات/40 ثانية للعمليات الحساسة، وحد للطلبات المتزامنة (`electron/services/rateLimiter.js`) |
| حماية صفحات الأدمن | الواجهة: `pagePermissions` في `App.jsx` (صفحة غير مدرجة = مرفوضة). الخادم المركزي: `/api/admin/*` للمدير فقط. القنوات (IPC) والـ REST تفحص الصلاحية في الخادم وليس الواجهة فقط |
| حجم الطلب | حد 2MB على الجسم في كل الخوادم |

## ما تم تغييره
| # | التغيير | الملف |
|---|---|---|
| 1 | قفل مجلد البيانات (قاعدة البيانات، النسخ الاحتياطية، مفتاح الـ vault) لصاحب الحساب فقط: ACL على Windows (`icacls`) و`chmod 700` على غيره، مرة واحدة عند أول تشغيل | `electron/security/dataLock.js`، `electron/database/connection.js` |
| 2 | أي مسار REST غير مدرج في خريطة الصلاحيات صار للمدير فقط (كان مفتوحًا لأي مستخدم مسجل) | `electron/security/permissions.js` |
| 3 | رؤوس أمان على كل ردود الخوادم: `nosniff`، `X-Frame-Options: DENY`، `no-store`، CSP مقفل، `no-referrer` | `electron/security/securityHeaders.js`، `corsPolicy.js` |
| 4 | وضع الإنتاج هو الافتراضي (أي قيمة غير `development`/`test`): عناوين Vite المحلية مرفوضة في CORS، ولوحة المراقبة والـ telemetry لا تعمل، و`X-Powered-By` معطل، وأخطاء SQLite لا تصل للعميل | `api-server.js`، `corsPolicy.js` |
| 5 | تشفير الأسرار المخزنة نصًا (سر الفاتورة الإلكترونية، مفاتيح التتبع والدليفري)، وإخفاء مفاتيح قنوات البيع عن الواجهة، وإجبار https للويب هوك | (الرد السابق) |
| 6 | قفل الدخول يُحفظ ويتصاعد (1 ثم 5 ثم 15 دقيقة) | `auth.service.js` |
| 7 | Dependabot أسبوعي + `pnpm audit --prod` في CI + توقيع الكود في الإصدار (يحتاج شهادة) | `.github/` |

## تحديث المكتبات
- تحديثات ضمن النطاق: electron 44.11.3، electron-updater، vite 8.3.8، react/react-dom 19.3.1، playwright 1.65.1، prettier، jest 30.5.2، وغيرها.
- `electron-builder` من 25 إلى 26.18 (يغلق ثغرات `app-builder-lib` و`tar`).
- `overrides` في `pnpm-workspace.yaml` لـ body-parser و undici و uuid و zod و source-map-js و glob و minimatch.
- نتيجة `pnpm audit`: من 2 (1 عالية) في الإنتاج و19 مع أدوات التطوير، إلى ثغرة واحدة: `picomatch` في jest (أدوات اختبار فقط، ولا يوجد إصدار مصحح بعد).

## ما لم يتغير (قرارات تحتاج منك)
- قاعدة البيانات غير مشفرة على القرص (يحتاج SQLCipher وترحيل بيانات العملاء).
- `better-sqlite3` بقي على 13.0.3: الإصدار 13.2 فشل بناؤه هنا (يحتاج أدوات بناء native)، وهو يعمل كاملًا بدون تحديث.
- Express بقي على 4.x (5.x تغيير كبير في التوجيه).
- التطبيق نفسه لا يعمل بوضع التطوير تلقائيًا: لتشغيل Vite على المنفذ 5173 مع الـ REST اضبط `NODE_ENV=development`.
- لم أجرّب بناء المثبّت الكامل بعد ترقية electron-builder (يحتاج أسرار الإصدار).

## نتائج الاختبار
- Jest: 1418 ناجح، 6 فاشل. خمسة منها في `enterprise.service.test.js` وكانت تفشل قبل أي تعديل، والسادس اختبار ضغط (`performance_load.test.js`، 50 عملية بيع متتالية) فشل مرة داخل التشغيل الكامل المزدحم ونجح كل اختباراته (6 من 6) عند تشغيله منفردًا.
- Vitest (الواجهة): 286 من 286 ناجح.
- ESLint: 0 أخطاء، 4 تحذيرات قديمة.
- اختبارات جديدة في `tests/security/production-hardening.test.js` (9 اختبارات): قفل المجلد، رؤوس الأمان، وضع الإنتاج وCORS، وإغلاق المسارات غير المدرجة.
