# Encrypted Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every backup (manual, daily, on-close) is an authenticated, encrypted `.fbk` file. Restore rejects anything unencrypted or modified. A printed recovery key opens backups on a new PC.

**Architecture:**
- A pure crypto module handles the `.fbk` format: AES-256-GCM, with the header used as AAD, and the recovery key encoding.
- A key service keeps a keyring in `userData/backup.key`. Each key is encrypted with Electron `safeStorage`.
- `backup.service` writes `.fbk` files through a private temp file in `userData/backups/.tmp`. Restore decrypts to a private temp file, then runs the existing checks (integrity, sanitize, atomic swap, `rotateSecret`).

**Tech Stack:**
- Node `crypto` (aes-256-gcm, sha256, randomBytes)
- Electron `safeStorage` / `app.getPath`
- better-sqlite3
- Jest
- React (renderer)

**Spec:** `docs/superpowers/specs/2026-11-04-encrypted-backups-design.md`

## Global Constraints

- Files: `.fbk`. Header: magic `FXBK` (4 bytes) | version `1` (1 byte) | keyId (8 bytes) | nonce (12 bytes). That is 25 bytes, followed by ciphertext and a 16-byte GCM tag. AAD is the 25-byte header.
- `keyId = sha256("fxbk-key-id" || key)[0..8]`. Key = 32 random bytes.
- Recovery key: `FXR-` followed by Base32 (RFC 4648 alphabet, no padding) of `key || sha256(key)[0..2]`, in groups of 4 separated by `-`. Parsing ignores case, spaces and dashes, and maps `0→O` and `1→I`.
- Never write unencrypted backup bytes outside `userData`. Delete every temp file in `finally`.
- Never fall back to an unprotected key. If `safeStorage.isEncryptionAvailable()` is false, throw.
- Plain `.db` (any non-`FXBK`) files are always rejected at restore.
- User-facing messages in Arabic, exactly as in spec §6:
  - "الملف ده مش نسخة احتياطية مشفّرة من البرنامج"
  - "الملف اتعدّل أو تالف ومش هيتسترجع"
  - "المفتاح ده مش بتاع النسخة دي"
  - "في غلطة في كتابة مفتاح الاسترداد"
- No DB migration.
- Run all tests with: `npm test` (jest, `--runInBand`).

## Review Focus

1. **Truncated `.fbk`** (partially copied to a USB stick): restore must reject it with the "اتعدّل أو تالف" message, not crash. Test in Task 1.
2. **Zero-byte or tiny file chosen in the dialog:** reject with "مش نسخة احتياطية مشفّرة", with no exception from slicing. Test in Task 1.
3. **Recovery key typed by hand:** lowercase, spaces, `0`/`O` and `1`/`I` confusion must all parse. One wrong letter must give the checksum error. Test in Task 1.
4. **Write failure mid-backup** (disk full, USB pulled): no partial `.fbk` at the destination, and no plain temp left in `.tmp`. Test in Task 3.
5. **`backup.key` corrupted while backups exist:** `ensureBackupKey()` must throw and must not silently create a new key that orphans the old backups. Restore of those backups then asks for the recovery key. Test in Task 2.

---

### Task 1: `.fbk` format and recovery key (pure crypto)

**Files:**
- Create: `electron/security/backupCrypto.js`
- Test: `tests/security/backup-crypto.test.js`

**Interfaces:**
- Produces:
  - `keyIdOf(key: Buffer) -> Buffer(8)`
  - `encryptBackup(plain: Buffer, key: Buffer) -> Buffer` (full `.fbk` bytes)
  - `readHeader(buf: Buffer) -> { version: 1, keyId: Buffer(8) }`. Throws `BackupFormatError` (message "الملف ده مش نسخة احتياطية مشفّرة من البرنامج") when the buffer is shorter than 41 bytes or the magic/version is wrong.
  - `decryptBackup(buf: Buffer, key: Buffer) -> Buffer`. Throws `BackupIntegrityError` ("الملف اتعدّل أو تالف ومش هيتسترجع") on tag failure.
  - `formatRecoveryKey(key: Buffer) -> string`
  - `parseRecoveryKey(text: string) -> Buffer(32)`. Throws `RecoveryKeyError` ("في غلطة في كتابة مفتاح الاسترداد").
  - Error classes are exported: `BackupFormatError`, `BackupIntegrityError`, `RecoveryKeyError`.

- [ ] **Step 1: Write failing tests** in `tests/security/backup-crypto.test.js`. Use `crypto.randomBytes(32)` keys and a 5 KB random buffer as "plain":
  - `round-trips the original bytes`: `decryptBackup(encryptBackup(plain,key), key)` equals `plain`. The output starts with `Buffer.from('FXBK')`, and `readHeader(...).keyId` equals `keyIdOf(key)`.
  - `two encryptions of the same data differ` (random nonce).
  - `rejects any single flipped byte`: for offsets `[0, 4, 5, 13, 25, 100, length-1]`, flip one bit. Offsets 0–4 throw `BackupFormatError`; the rest throw `BackupIntegrityError`.
  - `rejects the wrong key` → `BackupIntegrityError`.
  - `rejects a plain SQLite file`: `Buffer.from('SQLite format 3\0...')` → `BackupFormatError`.
  - `rejects empty and tiny files`: `Buffer.alloc(0)` and `Buffer.alloc(40)` → `BackupFormatError` (Review Focus 2).
  - `rejects a truncated file`: `encrypted.subarray(0, encrypted.length - 10)` → `BackupIntegrityError` (Review Focus 1).
  - `recovery key round-trips`: the output matches `/^FXR-([A-Z2-7]{4}-)*[A-Z2-7]{1,4}$/`, and `parseRecoveryKey(formatRecoveryKey(key))` equals `key`.
  - `recovery key tolerates how people type it`: lowercase, spaces instead of dashes, and `O→0` / `I→1` substitutions all parse to the same key (Review Focus 3).
  - `recovery key catches a one-letter typo` → `RecoveryKeyError`.

- [ ] **Step 2: Run** `npx jest --runInBand tests/security/backup-crypto.test.js`. Expected: FAIL with "Cannot find module '../../electron/security/backupCrypto'".

- [ ] **Step 3: Implement** `electron/security/backupCrypto.js` per the Interfaces and the Global Constraints layout. Use `crypto.createCipheriv('aes-256-gcm', key, nonce)`, `setAAD(header)`, and `getAuthTag()` (16 bytes). Base32 is a small local encoder/decoder (no dependency). The checksum is `sha256(key)[0..2]`.

- [ ] **Step 4: Run** the same command. Expected: PASS (11 tests).

- [ ] **Step 5: Commit** — `git add electron/security/backupCrypto.js tests/security/backup-crypto.test.js` then `git commit -m "Add .fbk backup format and recovery key encoding"`

---

### Task 2: Backup keyring service

**Files:**
- Create: `electron/services/backupKey.service.js`
- Test: `tests/security/backup-key.test.js`

**Interfaces:**
- Consumes: `keyIdOf`, `formatRecoveryKey`, `parseRecoveryKey` (Task 1).
- Produces:
  - `ensureBackupKey() -> { keyId: string(hex), created: boolean }`
  - `getPrimaryKey() -> Buffer`
  - `findKey(keyId: Buffer) -> Buffer | null`
  - `adoptRecoveryKey(text: string, expectedKeyId: Buffer) -> Buffer`. Throws `RecoveryKeyError`, or `Error("المفتاح ده مش بتاع النسخة دي")` on a mismatch. The keyring is left unchanged on any failure.
  - `getRecoveryKey() -> string` (the primary key, formatted)
- File: `path.join(app.getPath('userData'), 'backup.key')`. Contents: JSON `{ version: 1, primary: "<hex keyId>", keys: { "<hex keyId>": "<base64 safeStorage blob>" } }`. Written with temp file + rename.

- [ ] **Step 1: Write failing tests.** Mock `electron`: `app.getPath()` returns a temp dir; `safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('enc:'+s), decryptString: b => b.toString().slice(4) }`. Tests:
  - `creates one key and keeps it across restarts`: the first `ensureBackupKey()` gives `created:true`; after `jest.resetModules()`, it gives `created:false` with the same `keyId`, and `getPrimaryKey()` is equal.
  - `never stores the key in clear`: `backup.key` does not contain the key's hex or base64.
  - `refuses to work without safeStorage`: `isEncryptionAvailable: () => false`, so `ensureBackupKey()` throws.
  - `does not replace a corrupted keyring`: write `"{not json"` to `backup.key`. `ensureBackupKey()` throws, and the file content is unchanged (Review Focus 5).
  - `adopting a recovery key makes it primary and keeps the old one`: create key A, then adopt `formatRecoveryKey(B)` with `keyIdOf(B)`. Now `getPrimaryKey()` equals B and `findKey(keyIdOf(A))` equals A.
  - `a recovery key for another backup is rejected and changes nothing`: adopt B with `expectedKeyId = keyIdOf(C)` → throws "المفتاح ده مش بتاع النسخة دي", and the file bytes are unchanged.
  - `getRecoveryKey parses back to the primary key`.

- [ ] **Step 2: Run** `npx jest --runInBand tests/security/backup-key.test.js`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `electron/services/backupKey.service.js` per the Interfaces. A missing file means create. An unreadable or unparseable file means throw `Error('مفتاح النسخ الاحتياطية على الجهاز تالف. استخدم مفتاح الاسترداد')`, and do not overwrite it.

- [ ] **Step 4: Run** the same command. Expected: PASS (7 tests).

- [ ] **Step 5: Commit** — `git commit -m "Add backup keyring stored with safeStorage"` (both files).

---

### Task 3: Backups are written as `.fbk`

**Files:**
- Modify: `electron/services/backup.service.js`
  - `backupToFile` (lines 117-137)
  - `getDefaultBackupPath` (68-70)
  - `autoBackupOnClose` (261-283)
  - `autoBackupDaily` (285-315)
- Modify tests: `tests/services/backup.service.test.js`, `tests/security/backup-restore-hardening.test.js` (backup parts only), `tests/services/settings.service.test.js`
- Test: `tests/security/backup-encrypted-write.test.js`

**Interfaces:**
- Consumes: `encryptBackup`, `decryptBackup`, `readHeader` (Task 1); `ensureBackupKey`, `getPrimaryKey`, `findKey` (Task 2).
- Produces:
  - `backupToFile(destPath)` now writes `.fbk` bytes.
  - `verifyBackupFile(filePath) -> void`: decrypts with the keyring into a private temp file, runs `verifyDatabase`, deletes the temp file. Throws the Task 1 errors.
  - File names become `kashiear-auto-<ts>.fbk`, `kashiear-daily-<date>.fbk` and `foxcloud-backup-<date>.fbk`.
  - Private temp dir: `path.join(app.getPath('userData'), 'backups', '.tmp')`.

- [ ] **Step 1: Write failing tests** in `tests/security/backup-encrypted-write.test.js`. Reuse the mock style of `backup-restore-hardening.test.js`, with a real temp live DB, `db.backup` copying it, and `safeStorage` mocked as in Task 2:
  - `backupNow writes an encrypted .fbk`: the file starts with `FXBK`, does not contain the bytes `SQLite format 3`, and `decryptBackup(file, getPrimaryKey())` gives a DB with the live `settings` marker.
  - `daily and on-close backups are .fbk and pruning keeps 30 / 5`: create 6 old `kashiear-auto-*.fbk`; after `autoBackupOnClose()` 5 remain.
  - `a valid existing daily backup is skipped, a damaged one is rewritten` (with `.fbk` names; replaces the old `.db`-based test).
  - `no plain copy is left behind`: after each backup, `.tmp` is empty and the destination folder contains only `.fbk` files.
  - `a failed write leaves nothing at the destination` (Review Focus 4): `jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('ENOSPC') })`. The result has `success:false`, and the destination and `.tmp` have no files.
  - `getDefaultBackupPath ends with .fbk`.

- [ ] **Step 2: Run** `npx jest --runInBand tests/security/backup-encrypted-write.test.js`. Expected: FAIL (the output starts with `SQLite format 3`).

- [ ] **Step 3: Implement.**
  - `backupToFile`: `ensureBackupKey()` → `db.backup(<.tmp>/<uuid>.db)` → `encryptBackup(readFileSync, getPrimaryKey())` → write `<dest>.<uuid>.tmp` → `fsync` → `replaceFileAtomically`. Delete both temps in `finally`.
  - The daily "already exists" check uses `verifyBackupFile`.
  - Update the name patterns and regexes to `.fbk`.
  - Update the existing tests that expect `.db` names or read backups with `new Database(...)` directly so they decrypt first. Keep their intent.

- [ ] **Step 4: Run** `npx jest --runInBand tests/security tests/services/backup.service.test.js tests/services/settings.service.test.js`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "Write all backups as encrypted .fbk files"`

---

### Task 4: Restore decrypts, asks for the recovery key, rejects anything else

**Files:**
- Modify: `electron/services/backup.service.js` — `restoreDatabase` (187-259), `restoreFromBackup` (171-185, dialog filter `extensions: ['fbk']`)
- Modify test: `tests/security/backup-restore-hardening.test.js` (fixtures become `.fbk` through `encryptBackup`)
- Test: `tests/security/backup-restore-encrypted.test.js`

**Interfaces:**
- Consumes: Task 1 and Task 2 functions, `verifyBackupFile` (Task 3).
- Produces: `restoreDatabase(sourcePath: string, { recoveryKey?: string } = {})`. It resolves to one of:
  - `{ success: true, message }` (then relaunches)
  - `{ success: false, needsRecoveryKey: true }` — nothing touched
  - It throws with one of the spec §6 messages.

- [ ] **Step 1: Write failing tests** in `tests/security/backup-restore-encrypted.test.js`. Use the same mocks as Task 3, and assert the live DB marker after each case:
  - `restores a backup made on this device`: marker = restored, and the secret file is rotated.
  - `rejects a backup with one modified byte and leaves the live DB untouched` → "الملف اتعدّل أو تالف".
  - `rejects a plain .db file` → "مش نسخة احتياطية مشفّرة".
  - `asks for the recovery key when the backup belongs to another key`: encrypt with key B, which is not in the keyring. The result is `{ success:false, needsRecoveryKey:true }` and the marker stays live.
  - `restores with the right recovery key and adopts it`: `restoreDatabase(p, { recoveryKey: formatRecoveryKey(B) })` gives success, `getPrimaryKey()` equals B, and the old key A is still found.
  - `rejects a recovery key that belongs to a different backup and keeps the keyring`: the keyring file bytes are unchanged.
  - `the decrypted temp file never stays behind`: `.tmp` is empty after success and after each failure.
  - The existing F2 sanitize tests (`backup-restore-hardening.test.js`) still pass with `.fbk` fixtures.

- [ ] **Step 2: Run** `npx jest --runInBand tests/security/backup-restore-encrypted.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** the spec §5 order:
  1. `readHeader`
  2. `findKey`, or, if none, return `needsRecoveryKey` or parse/check the recovery key
  3. `decryptBackup` into `.tmp`
  4. The existing `verifyDatabase` → `sanitizeRestoreCandidate` → emergency backup → swap → `rotateSecret`
  5. `adoptRecoveryKey` only after decryption succeeds and before the swap
  6. `finally` deletes the temp

- [ ] **Step 4: Run** `npx jest --runInBand tests/security tests/services/backup.service.test.js`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "Restore only authenticated .fbk backups, with recovery key on new devices"`

---

### Task 5: IPC — recovery key on setup and on demand, restore with recovery key

**Files:**
- Modify:
  - `electron/services/auth.service.js` — add `requireOwnerPassword(password)` and export it
  - `electron/handlers/auth.handler.js:16-19`
  - `electron/handlers/backup.handler.js`
  - `electron/handlers/settings.handler.js` — the backup/restore dialogs: filters `['fbk']`; restore passes `{ recoveryKey }` and returns `needsRecoveryKey`
  - `electron/preload.js:55-56,169-170` — plus the new `getBackupRecoveryKey`
- Test: `tests/security/backup-ipc.test.js`

**Interfaces:**
- Consumes: `ensureBackupKey`, `getRecoveryKey` (Task 2); `restoreDatabase(path, { recoveryKey })` (Task 4).
- Produces:
  - `authService.requireOwnerPassword(password: string) -> session`. Throws "غير مصرح لك بتنفيذ هذا الإجراء" unless the current session is the main admin (`role 'admin'`, no `system_role_key`) and `bcrypt.compareSync(password, password_hash)` passes.
  - IPC `backup:getRecoveryKey` (`{ password }`) → `{ recoveryKey }`.
  - `auth:createInitialAdmin` result gains `backupRecoveryKey`.
  - `settings:restore` (`{ recoveryKey? }`) → `{ success, message }`, `{ needsRecoveryKey: true, filePath }` or `{ canceled: true }`. When `filePath` is passed back with `recoveryKey`, the dialog is skipped.
  - Preload: `getBackupRecoveryKey(password)` and `restoreDatabase(options)`.

- [ ] **Step 1: Write failing tests** in `tests/security/backup-ipc.test.js`. Capture handlers via a `safeHandle` mock, as in `backup-restore-hardening.test.js`, and use the real `auth.service` with mocked repos, as in `admin-takeover.test.js`:
  - `getRecoveryKey requires the owner's password`: owner with the wrong password → throws; owner with the right password → `{ recoveryKey }` matching `/^FXR-/`.
  - `getRecoveryKey refuses job roles even with their own correct password`: a `system_role_key: 'hr'` user → throws.
  - `createInitialAdmin returns a backup recovery key`.
  - `settings:restore forwards the recovery key and passes needsRecoveryKey back`: mock `restoreDatabase`, then assert the call args and the returned shape.
  - `tests/security/ipc-channel-coverage.test.js` still passes. `backup:getRecoveryKey` maps to `settings.view` and is additionally gated by `requireOwnerPassword`.

- [ ] **Step 2: Run** `npx jest --runInBand tests/security/backup-ipc.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** per the Interfaces.

- [ ] **Step 4: Run** `npx jest --runInBand tests/security`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "Expose backup recovery key behind the owner password"`

---

### Task 6: Renderer — show the key at setup, in settings, and ask for it on restore

**Files:**
- Modify:
  - `src/pages/InitialSetupPage.jsx` — the `recovery_key` step (around line 389): second key block, with copy and print
  - `src/contexts/SettingsContext.jsx:155-170` — pass options and results through
  - `src/pages/SettingsPage.jsx` — backup card (around lines 89-140): status "النسخ الاحتياطية مشفّرة", a "عرض مفتاح استرداد النسخ" button (password prompt, then show, copy and print), and a recovery-key input when restore returns `needsRecoveryKey` (resubmits with `filePath` + `recoveryKey`)

**Interfaces:**
- Consumes: the preload API from Task 5.

- [ ] **Step 1: No renderer test runner exists** (vitest is not installed, see `tests/frontend`). The behavior is covered by the Task 5 IPC tests. Do not add a runner in this plan.
- [ ] **Step 2: Implement** the three UI changes. Follow the existing recovery-key styling (`.recovery-key-code`) and the existing `window.confirm` / feedback patterns in `SettingsPage.jsx`. Printing uses `window.print()` on a small printable block.
- [ ] **Step 3: Verify** with `npx eslint src/pages/InitialSetupPage.jsx src/pages/SettingsPage.jsx src/contexts/SettingsContext.jsx` (0 errors) and `npm run build` (vite build succeeds).
- [ ] **Step 4: Commit** — `git commit -m "Show backup recovery key at setup and in settings; prompt for it on restore"`

---

### Task 7: Full verification

- [ ] **Step 1:** Run `npm test`. Expected: 0 failed. Report the totals.
- [ ] **Step 2:** End-to-end script in the scratchpad against a throwaway `FOX_USER_DATA_DIR`, with real `db.js` and `safeStorage` mocked:
  1. Back up the database.
  2. Confirm the file has no `SQLite format 3` and no `users` bytes.
  3. Flip one byte and confirm the restore is rejected.
  4. Delete `backup.key` to simulate a new device, and confirm restore asks for the recovery key.
  5. Restore with the recovery key and confirm it succeeds.
- [ ] **Step 3:** Run `npx eslint electron src tests --quiet`. Expected: 0 errors.
- [ ] **Step 4: Commit** any test-only fixes. Do not push.
