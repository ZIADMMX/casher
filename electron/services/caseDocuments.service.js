const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, shell } = require('electron');
const casesRepository = require('../repositories/cases.repository');

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.csv', '.doc', '.docx', '.jpeg', '.jpg', '.pdf', '.png', '.rtf', '.txt', '.xls', '.xlsx',
]);

function getStorageDirectory() {
  if (!app?.getPath) throw new Error('مساحة تخزين مستندات القضايا غير متاحة');
  return path.resolve(app.getPath('userData'), 'case-documents');
}

function ensureStoredPath(filePath) {
  const root = getStorageDirectory();
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(root, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('مسار المستند المؤرشف غير صالح');
  }
  const realPath = fs.realpathSync(absolutePath);
  const realRelativePath = path.relative(fs.realpathSync(root), realPath);
  if (!realRelativePath || realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
    throw new Error('مسار المستند المؤرشف غير صالح');
  }
  return realPath;
}

function resolveDocumentPath(filePath) {
  const absolutePath = path.resolve(filePath);
  const root = getStorageDirectory();
  const relativePath = path.relative(root, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return absolutePath;
  return ensureStoredPath(absolutePath);
}

function isManagedPath(filePath) {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(getStorageDirectory(), absolutePath);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function copyIntoArchive(sourcePath, caseId) {
  const parsedCaseId = Number(caseId);
  if (!Number.isSafeInteger(parsedCaseId) || parsedCaseId < 1) {
    throw new Error('معرف القضية غير صالح');
  }
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new Error('اختر ملفًا لإضافته إلى الأرشيف');
  }
  const extension = path.extname(sourcePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('نوع الملف غير مدعوم للأرشفة');

  const stat = fs.statSync(sourcePath);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_FILE_SIZE) {
    throw new Error('يجب أن يكون الملف غير فارغ وألا يتجاوز 25 ميجابايت');
  }

  const directory = path.join(getStorageDirectory(), `case-${parsedCaseId}`);
  fs.mkdirSync(directory, { recursive: true });
  const storedPath = path.join(directory, `${crypto.randomUUID()}${extension}`);
  fs.copyFileSync(sourcePath, storedPath, fs.constants.COPYFILE_EXCL);
  return { file_path: storedPath, file_size: stat.size };
}

function getVersions(documentId) {
  if (!Number.isSafeInteger(Number(documentId)) || Number(documentId) < 1) {
    throw new Error('معرف المستند غير صالح');
  }
  const document = casesRepository.getDocumentById(documentId);
  if (!document) throw new Error('المستند غير موجود');
  return casesRepository.getDocumentVersions(documentId);
}

async function openDocument(documentId, version = null) {
  if (!Number.isSafeInteger(Number(documentId)) || Number(documentId) < 1) {
    throw new Error('معرف المستند غير صالح');
  }
  const document = casesRepository.getDocumentById(documentId);
  if (!document) throw new Error('المستند غير موجود');
  const archivedVersion = version == null
    ? null
    : casesRepository.getDocumentVersion(documentId, Number(version));
  if (version != null && !archivedVersion) throw new Error('نسخة المستند غير موجودة');
  const targetPath = resolveDocumentPath(archivedVersion?.file_path || document.file_path);
  if (!fs.existsSync(targetPath)) throw new Error('الملف المؤرشف غير موجود على الجهاز');
  const openError = await shell.openPath(targetPath);
  if (openError) throw new Error(`تعذر فتح المستند: ${openError}`);
  return { opened: true };
}

function downloadDocument(documentId, destinationPath, version = null) {
  if (!Number.isSafeInteger(Number(documentId)) || Number(documentId) < 1) {
    throw new Error('معرف المستند غير صالح');
  }
  const document = casesRepository.getDocumentById(documentId);
  if (!document) throw new Error('المستند غير موجود');
  const archivedVersion = version == null
    ? null
    : casesRepository.getDocumentVersion(documentId, Number(version));
  if (version != null && !archivedVersion) throw new Error('نسخة المستند غير موجودة');
  const sourcePath = resolveDocumentPath(archivedVersion?.file_path || document.file_path);
  if (!fs.existsSync(sourcePath)) throw new Error('الملف المؤرشف غير موجود على الجهاز');
  if (typeof destinationPath !== 'string' || !destinationPath.trim()) {
    throw new Error('مسار حفظ التنزيل غير صالح');
  }
  fs.copyFileSync(sourcePath, destinationPath);
  return { saved: true, path: destinationPath };
}

function createDocument(data) {
  const storedFile = copyIntoArchive(data.source_path, data.case_id);
  try {
    return casesRepository.createDocument({
      ...data,
      file_path: storedFile.file_path,
      file_size: storedFile.file_size,
    });
  } catch (error) {
    fs.unlinkSync(storedFile.file_path);
    throw error;
  }
}

function updateDocument(id, data) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    throw new Error('معرف المستند غير صالح');
  }
  const existing = casesRepository.getDocumentById(id);
  if (!existing) throw new Error('المستند غير موجود');
  const updateData = { ...data };
  if (typeof data.title === 'string') updateData.title = data.title.trim();
  let newFile = null;
  if (data.source_path) {
    newFile = copyIntoArchive(data.source_path, existing.case_id);
    updateData.versionFile = {
      ...newFile,
      uploaded_by: data.uploaded_by || null,
    };
  }
  try {
    const updated = casesRepository.updateDocument(id, updateData);
    if (!updated) throw new Error('المستند غير موجود');
    return updated;
  } catch (error) {
    if (newFile && fs.existsSync(newFile.file_path)) fs.unlinkSync(newFile.file_path);
    throw error;
  }
}

function restoreVersion(documentId, version, userId) {
  if (!Number.isSafeInteger(Number(documentId)) || Number(documentId) < 1
    || !Number.isSafeInteger(Number(version)) || Number(version) < 1) {
    throw new Error('معرف المستند أو النسخة غير صالح');
  }
  const document = casesRepository.getDocumentById(documentId);
  const archivedVersion = casesRepository.getDocumentVersion(documentId, Number(version));
  if (!document || !archivedVersion) throw new Error('نسخة المستند غير موجودة');
  const sourcePath = resolveDocumentPath(archivedVersion.file_path);
  if (!fs.existsSync(sourcePath)) throw new Error('ملف النسخة غير موجود على الجهاز');
  const restored = copyIntoArchive(sourcePath, document.case_id);
  try {
    return casesRepository.updateDocument(documentId, {
      versionFile: { ...restored, uploaded_by: userId || null },
    });
  } catch (error) {
    fs.unlinkSync(restored.file_path);
    throw error;
  }
}

function deleteDocument(documentId) {
  if (!Number.isSafeInteger(Number(documentId)) || Number(documentId) < 1) {
    throw new Error('معرف المستند غير صالح');
  }
  const result = casesRepository.deleteDocument(documentId);
  if (!result.changes) throw new Error('المستند غير موجود');
  for (const filePath of new Set(result.files)) {
    if (!isManagedPath(filePath)) continue;
    const storedPath = ensureStoredPath(filePath);
    if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
  }
  return { deleted: true };
}

module.exports = {
  createDocument,
  updateDocument,
  deleteDocument,
  getVersions,
  openDocument,
  downloadDocument,
  restoreVersion,
};
