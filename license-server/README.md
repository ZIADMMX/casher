# سيرفر وقت الترخيص (Cloudflare Worker)

سيرفر صغير بيعمل حاجتين:

- **بيقول للبرنامج الوقت الحقيقي**، فساعة جهاز العميل مالهاش لازمة.
- **بيفتكر أول مرة كل جهاز اشتغل فيها**، فمسح البرنامج أو إعادة تثبيته مش بيرجّع التجربة المجانية من الأول.

كل رد موقّع بمفتاح Ed25519. البرنامج بيتأكد من التوقيع، فالسيرفر المزيّف أو الرد القديم بيترفضوا.

## النشر (مرة واحدة)

شغّل الأوامر دي من فولدر `license-server`:

```bash
npm install
```

```bash
npx wrangler login
```
الأمر ده بيفتح المتصفح، وإنت توافق بحساب Cloudflare بتاعك.

```bash
npx wrangler d1 create foxcloud-license
```
خد قيمة `database_id` اللي هتطلع، وحطها في `wrangler.toml` مكان `REPLACE_WITH_D1_DATABASE_ID`.

```bash
npx wrangler d1 execute foxcloud-license --remote --file schema.sql
```

```bash
node ../scripts/time-server-init.js --print-secret | npx wrangler secret put TIME_SIGNING_KEY
```

```bash
npx wrangler deploy
```

هيطلعلك رابط زي `https://foxcloud-license.<اسمك>.workers.dev`. حط الرابط ده في ملف `.env` اللي في فولدر المشروع الرئيسي:

```
FOX_LICENSE_TIME_URL=https://foxcloud-license.<اسمك>.workers.dev/api/license/time
```

## مفتاح السيرفر

`scripts/time-server-init.js` بيعمل المفتاح الخاص في `~/.foxcloud/time-server-key.pem`، وبيكتب المفتاح العام في `electron/security/time-server-public-key.js`.

ده مفتاح منفصل عن مفتاح التراخيص: لو السيرفر اتخترق، اللي اخترقه مش هيقدر يطلّع مفاتيح تفعيل. اعمله نسخة احتياطية زي مفتاح التراخيص بالظبط.

## الحدود المجانية

الخطة المجانية فيها 100,000 طلب في اليوم. البرنامج بيسأل السيرفر مرة كل 15 دقيقة وهو شغال، يعني حوالي 100 طلب في اليوم لكل جهاز كاشير، فالخطة المجانية تكفي حوالي 1,000 جهاز.

## تسليم نسخة عملاء لمحل (أو نقلها لجهاز جديد)

عملاء كل محل متخزنين في `cloud_customers` تحت رقم جهازه (`device_id`). البرنامج نفسه بيقرا عملاء جهازه بس — التحقق بيربط كل جهاز بترخيصه — لكن انت صاحب حساب Cloudflare، فبتقدر تقرا أي محل من هنا.

الربط بين المحل ورقم جهازه: أول ٨ خانات من `device_id` هي نفسها كود الجهاز (HWID) اللي العميل بيقراهولك وقت التفعيل.

**١. تشوف عملاء محل:**

```bash
npx wrangler d1 execute foxcloud-license --remote --command "SELECT device_id, name, phone, email, loyalty_points FROM cloud_customers WHERE device_id LIKE 'ادخل_الـHWID_هنا%';"
```

**٢. تسلّمه نسخة كملف:**

```bash
npx wrangler d1 execute foxcloud-license --remote --json --command "SELECT * FROM cloud_customers WHERE device_id LIKE 'ادخل_الـHWID_هنا%';" > backup-shop.json
```

**٣. جهازه اتغير أو اتفرمت:** الجهاز الجديد له `device_id` جديد، فعملاءه القدام مش هيرجعوله لوحدهم. بعد ما تطلّعله ترخيص للجهاز الجديد، حوّل صفوفه للرقم الجديد:

```bash
npx wrangler d1 execute foxcloud-license --remote --command "UPDATE cloud_customers SET device_id = 'رقم_الجهاز_الجديد_بالكامل' WHERE device_id = 'رقم_الجهاز_القديم_بالكامل';"
```

بعدها يضغط استرجاع من جهازه الجديد فيرجعوا كلهم. خد نسخة بخطوة ٢ قبل ما تعمل التحويل.

## تقارير الأخطاء

النسخ المتثبتة عند العملاء بتبعت أخطاءها لـ `POST /api/errors`، وبتتخزن في جدول `error_reports` لمدة 30 يوم. الإرسال بيشتغل في النسخة المغلّفة بس، وكل جهاز ليه حد 200 خطأ في الساعة.

لو السيرفر كان متنشر قبل الميزة دي، ضيف الجدول مرة واحدة:

```bash
npx wrangler d1 execute foxcloud-license --remote --file schema.sql
```

آخر 50 خطأ (أول 8 خانات من `hwid` هي كود جهاز العميل):

```bash
npx wrangler d1 execute foxcloud-license --remote --command "SELECT substr(device_id,1,8) AS hwid, version, context, message, count, datetime(created_at/1000,'unixepoch') AS at FROM error_reports ORDER BY id DESC LIMIT 50"
```
