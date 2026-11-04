const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, shell } = require('electron');
const crmRepo = require('../repositories/crmAdvanced.repository');

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MIME_TYPES = {
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function getStorageDirectory() {
  if (!app?.getPath) throw new Error('مساحة تخزين مرفقات CRM غير متاحة');
  return path.resolve(app.getPath('userData'), 'crm-attachments');
}

function ensureSafeStoredPath(filePath) {
  const root = getStorageDirectory();
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(root, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('مسار المرفق غير صالح');
  }
  return absolutePath;
}

function addAttachment(recordType, recordId, sourcePath, userId) {
  if (!['customer', 'company', 'lead', 'opportunity'].includes(recordType)) {
    throw new Error('نوع السجل غير صحيح');
  }
  if (!Number.isInteger(Number(recordId)) || Number(recordId) < 1) {
    throw new Error('معرف السجل غير صحيح');
  }
  if (!crmRepo.recordExists(recordType, Number(recordId))) throw new Error('السجل غير موجود');

  const extension = path.extname(sourcePath).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MIME_TYPES, extension)) {
    throw new Error('نوع الملف غير مدعوم');
  }
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_FILE_SIZE) {
    throw new Error('يجب أن يكون الملف أقل من 25 ميجابايت وغير فارغ');
  }

  const storageDirectory = getStorageDirectory();
  fs.mkdirSync(storageDirectory, { recursive: true });
  const storedPath = path.join(storageDirectory, `${crypto.randomUUID()}${extension}`);
  fs.copyFileSync(sourcePath, storedPath, fs.constants.COPYFILE_EXCL);

  try {
    return crmRepo.saveAttachment({
      record_type: recordType,
      record_id: Number(recordId),
      file_name: path.basename(sourcePath),
      file_path: storedPath,
      mime_type: MIME_TYPES[extension],
      size_bytes: stat.size,
    }, userId);
  } catch (error) {
    fs.unlinkSync(storedPath);
    throw error;
  }
}

function getAttachments(recordType, recordId) {
  if (!['customer', 'company', 'lead', 'opportunity'].includes(recordType)) {
    throw new Error('نوع السجل غير صحيح');
  }
  const id = Number(recordId);
  if (!Number.isInteger(id) || id < 1) throw new Error('معرف السجل غير صحيح');
  return crmRepo.getAttachments(recordType, id);
}

async function openAttachment(attachmentId) {
  const id = Number(attachmentId);
  if (!Number.isInteger(id) || id < 1) throw new Error('معرف المرفق غير صحيح');
  const attachment = crmRepo.getAttachmentById(id);
  if (!attachment) throw new Error('المرفق غير موجود');
  const storedPath = ensureSafeStoredPath(attachment.file_path);
  if (!fs.existsSync(storedPath)) throw new Error('ملف المرفق غير موجود على الجهاز');
  const error = await shell.openPath(storedPath);
  if (error) throw new Error(`تعذر فتح الملف: ${error}`);
  return { opened: true };
}

function removeRecordAttachments(recordType, recordId) {
  const files = crmRepo.removeAttachments(recordType, recordId);
  for (const file of files) {
    const storedPath = ensureSafeStoredPath(file.file_path);
    if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
  }
  return files.length;
}

module.exports = { addAttachment, getAttachments, openAttachment, removeRecordAttachments };
