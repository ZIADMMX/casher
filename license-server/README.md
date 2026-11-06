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
