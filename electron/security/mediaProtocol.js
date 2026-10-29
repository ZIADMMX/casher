const { app, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { logError } = require('../services/logger.service');

const ALLOWED_MEDIA_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function getUserDataDir() {
  if (app && typeof app.getPath === 'function') {
    return app.getPath('userData');
  }
  return process.env.FOX_E2E_USER_DATA_DIR || process.cwd();
}

/**
 * إرجاع قائمة المجلدات المسموح بقراءة الوسائط منها حصراً
 */
function getAllowedMediaDirectories() {
  const userData = getUserDataDir();
  const dirs = [
    path.join(userData, 'images'),
    path.join(userData, 'employee-images'),
  ];

  const publicDir = path.resolve(__dirname, '..', '..', 'public');
  if (fs.existsSync(publicDir)) {
    dirs.push(publicDir);
  }

  return dirs;
}

/**
 * التأكد من وجود مجلدات الوسائط حتى لا تفشل عمليات realpathSync
 */
function ensureMediaDirectoriesExist() {
  const userData = getUserDataDir();
  const dirs = [
    path.join(userData, 'images'),
    path.join(userData, 'employee-images'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        logError('EnsureMediaDir', err);
      }
    }
  }
}

/**
 * التحقق الأمني الصارم من مسار الملف والتأكد من أنه داخل المجلدات المسموحة فقط
 * يمنع ثغرات قراءة أي ملف على النظام (Arbitrary File Read / Path Traversal / Symlink Bypass)
 */
function validateAndResolveMediaPath(requestUrl) {
  if (typeof requestUrl !== 'string' || !requestUrl.startsWith('kashiear-media://')) {
    return { error: 'Bad Request', status: 400 };
  }

  let rawPath;
  try {
    let cleanUrl = requestUrl.replace(/^kashiear-media:\/\/+/, '');
    if (cleanUrl.toLowerCase().startsWith('localhost/')) {
      cleanUrl = cleanUrl.slice('localhost/'.length);
    }
    rawPath = decodeURIComponent(cleanUrl);
  } catch {
    return { error: 'Bad Request', status: 400 };
  }

  // منع هجمات Null Byte Injection
  if (rawPath.includes('\0')) {
    return { error: 'Forbidden', status: 403 };
  }

  // ضبط المسار على أنظمة POSIX إذا لزم الأمر
  if (process.platform !== 'win32' && !rawPath.startsWith('/')) {
    rawPath = '/' + rawPath;
  }

  // مسار مطلق أو مسار نسبي بالنسبة لـ userData
  const resolvedPath = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(getUserDataDir(), rawPath);

  // التحقق المبدئي من الامتداد
  const ext = path.extname(resolvedPath).toLowerCase();
  if (!ALLOWED_MEDIA_EXT.has(ext)) {
    return { error: 'Forbidden', status: 403 };
  }

  // التأكد من وجود الملف
  if (!fs.existsSync(resolvedPath)) {
    return { error: 'Not Found', status: 404 };
  }

  // التأكد من أن المسار هو ملف عادي وليس مجلد أو جهاز
  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      return { error: 'Forbidden', status: 403 };
    }
  } catch {
    return { error: 'Not Found', status: 404 };
  }

  // استخراج المسار الحقيقي القياسي لحل أي اختصارات أو روابط رمزية (Symlinks / Junctions)
  let canonicalFilePath;
  try {
    canonicalFilePath = fs.realpathSync(resolvedPath);
  } catch {
    return { error: 'Not Found', status: 404 };
  }

  // إعادة التحقق من الامتداد على الهدف الفعلي بعد حل الروابط الرمزية
  const canonicalExt = path.extname(canonicalFilePath).toLowerCase();
  if (!ALLOWED_MEDIA_EXT.has(canonicalExt)) {
    return { error: 'Forbidden', status: 403 };
  }

  // التحقق الحاسم: التأكد من أن الملف يقع حتماً داخل أحد المجلدات المسموح بها فقط
  const allowedDirs = getAllowedMediaDirectories();
  const isAllowed = allowedDirs.some((allowedDir) => {
    try {
      if (!fs.existsSync(allowedDir)) return false;
      const canonicalDir = fs.realpathSync(allowedDir);
      const relative = path.relative(canonicalDir, canonicalFilePath);

      // يجب أن يكون الملف داخل المجلد ولا يخرج عنه (لا يبدأ بـ .. وليس مساراً مطلقاً)
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return false;
      }

      // على ويندوز، التأكد من تطابق محرك الأقراص (Drive Letter)
      if (process.platform === 'win32') {
        const fileDrive = path.parse(canonicalFilePath).root.toLowerCase();
        const dirDrive = path.parse(canonicalDir).root.toLowerCase();
        if (fileDrive !== dirDrive) return false;
      }

      return true;
    } catch {
      return false;
    }
  });

  if (!isAllowed) {
    return { error: 'Forbidden', status: 403 };
  }

  return { filePath: canonicalFilePath };
}

/**
 * معالج بروتوكول kashiear-media الآمن
 */
async function handleMediaProtocolRequest(request) {
  try {
    const validation = validateAndResolveMediaPath(request.url);
    if (validation.error) {
      return new Response(validation.error, { status: validation.status });
    }
    return await net.fetch(pathToFileURL(validation.filePath).toString());
  } catch (err) {
    logError('MediaProtocol', err);
    return new Response('Not Found', { status: 404 });
  }
}

/**
 * تسجيل بروتوكول الوسائط
 */
function registerMediaProtocol() {
  ensureMediaDirectoriesExist();
  protocol.handle('kashiear-media', handleMediaProtocolRequest);
}

module.exports = {
  ALLOWED_MEDIA_EXT,
  getAllowedMediaDirectories,
  ensureMediaDirectoriesExist,
  validateAndResolveMediaPath,
  handleMediaProtocolRequest,
  registerMediaProtocol,
};
