---
name: sector-audit
description: Audit how complete each business sector of this POS/ERP is (retail, grocery, cafe_restaurant, electronics, maintenance, auto_workshop, spare_parts, subscriptions_gym, salon_barbershop, law_firm, crm) - what is built, what is missing for 100%, and a readiness-to-sell percentage backed by file evidence. Use whenever the user asks which sector is most complete, how ready a sector is to sell or deploy, what a sector is missing, to compare sectors, to plan the next sector work, or says things like "مراجعة القطاعات", "نواقص القطاع", "جاهزية البيع", "كام في المية", "القطاع ده ناقصه إيه", even if they never say "audit".
---

# Sector audit

Answer "how complete is each sector, and what stands between it and 100%" with
evidence from the code, not from the sector cards. The cards (`SectorCardsStep.jsx`),
`src/utils/sectorConfig.js` and `electron/database/onboardingPresets.data.js`
**promise** features. Only services, screens and tests **prove** them. Most of the
gap in this app is exactly that difference, so never count a feature as built
because it appears in those config files.

## 1. Run the probe

```bash
node .claude/skills/sector-audit/scripts/probe.js            # all sectors
node .claude/skills/sector-audit/scripts/probe.js law_firm   # one sector
node .claude/skills/sector-audit/scripts/probe.js --json     # for further processing
```

For every feature in `references/features.json` it searches for the identifier in three layers
and scores it: backend (`electron/services|repositories|handlers`) 50, screen
(`src/pages|components|hooks`) 30, tests 20. A sector's percentage is the weighted average.

| Mark | Meaning |
|---|---|
| ✔ 100 | backend + screen + test |
| ◐ 50-80 | built but missing a screen or a test |
| ○ config | only in config/seed/schema: promised, not built |
| ✘ | nothing |

## 2. Verify before you report

The probe finds names, not behavior. Before writing a verdict on a feature:
- **◐ / ✘**: open the files it lists (or grep for alternative names) and confirm. A ✘ can be
  a feature built under another name. If so, add that name to the `pattern` in
  `features.json` so the next run is right.
- **✔ on a feature that matters for sale**: read the main function once. Check that it is
  reachable from a screen for this sector (sidebar entry or POS button) and is not dead code.
- **Backend without screen** (e.g. salon commissions/packages): the user can't sell what the
  owner can't click. Report it as missing a screen, not as done.
- Run the project's own test command (`npm run test:backend`, `npm run test:frontend`),
  not a variant of it. Parallel jest runs produce false backup failures here.

## 3. Readiness to sell ≠ feature score

Feature score is what the probe gives. Readiness to sell is lower and also depends on:
- tests passing in the official commands,
- the sector's hardware working (kitchen printers, scale, barcode printer), and say if it was not tried,
- the cross-sector items: e-invoice/e-receipt (ETA) for Egypt, the installer and code signing, backup/restore.

Give both numbers and say which parts you did not check.

## 4. Report format

Write the report in Arabic (the user's language) to `docs/sector-readiness.md`. Overwrite it
each run so it stays one current file. Structure:

```markdown
# جاهزية القطاعات - <date>
## الترتيب   (table: القطاع | اكتمال الميزات | جاهزية البيع | أكبر ناقص)
## <sector name> - <n>%
**الموجود:** bullets, each with a file link
**الناقص للوصول 100%:** bullets, ordered by impact on selling, each tagged
  [شاشة] / [باك إند] / [اختبار] / [من الصفر]
## نواقص مشتركة بين كل القطاعات
## ما لم يتم فحصه
```

Order sectors by readiness, highest first. Each "missing" bullet should be concrete enough to
start work from (what table, what screen, what flow). "Improve the sector" is not a gap.

## 5. Keeping the standard current

`references/features.json` **is** the definition of 100% for each sector. When the user adds
a feature or a new sector, add an entry (`title`, `pattern`, `weight` 1-3, where 3 means the
sector can't sell without it) instead of judging by memory. Then re-run the probe.
