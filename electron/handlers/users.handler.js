const { app, BrowserWindow, dialog } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');
const {
  addUserSchema,
  positiveIdSchema,
  userActivitySchema,
  resetUserPasswordSchema,
} = require('../validators/schema');
const enterpriseService = require('../services/enterprise.service');

const profileImagesDir = path.join(app.getPath('userData'), 'employee-images');

function validateProfileImagePath(imagePath) {
  if (!imagePath) return;

  const resolvedRoot = path.resolve(profileImagesDir);
  const resolvedImage = path.resolve(imagePath);
  const relativePath = path.relative(resolvedRoot, resolvedImage);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('مسار صورة الموظف غير صالح');
  }

  const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  if (!allowedExtensions.has(path.extname(resolvedImage).toLowerCase())) {
    throw new Error('صيغة صورة الموظف غير مدعومة');
  }

  const canonicalRoot = fs.realpathSync(resolvedRoot);
  const canonicalImage = fs.realpathSync(resolvedImage);
  const canonicalRelativePath = path.relative(canonicalRoot, canonicalImage);
  if (!canonicalRelativePath || canonicalRelativePath.startsWith('..') || path.isAbsolute(canonicalRelativePath)) {
    throw new Error('مسار صورة الموظف غير صالح');
  }

  const imageStats = fs.statSync(resolvedImage);
  if (!imageStats.isFile() || imageStats.size > 5 * 1024 * 1024) {
    throw new Error('ملف صورة الموظف غير صالح أو يتجاوز 5 ميجابايت');
  }
}

function registerUsersHandlers() {
  safeHandle('users:getRoleOptions', () => {
    authService.requireAdmin();
    return enterpriseService.getRoles().map(({ role_key, role_name }) => ({ role_key, role_name }));
  });

  safeHandle('users:selectImage', async (event) => {
    authService.requireAdmin();
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'اختر صورة الموظف',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });

    if (result.canceled || !result.filePaths.length) return null;

    const sourcePath = result.filePaths[0];
    const extension = path.extname(sourcePath).toLowerCase();
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    if (!allowedExtensions.has(extension)) {
      throw new Error('صيغة صورة الموظف غير مدعومة');
    }
    if (fs.statSync(sourcePath).size > 5 * 1024 * 1024) {
      throw new Error('حجم صورة الموظف يجب ألا يتجاوز 5 ميجابايت');
    }

    fs.mkdirSync(profileImagesDir, { recursive: true });
    const imagePath = path.join(
      profileImagesDir,
      `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`,
    );
    fs.copyFileSync(sourcePath, imagePath);
    return imagePath;
  });

  safeHandle('users:add', addUserSchema, (event, data) => {
    authService.requireAdmin();
    validateProfileImagePath(data.profileImage);
    return authService.addCashier(data);
  });

  safeHandle('users:getAll', () => {
    authService.requireAdmin();
    return authService.getAllUsers();
  });

  safeHandle('users:getDetails', positiveIdSchema, (event, userId) => {
    authService.requireAdmin();
    return authService.getUserDetails(userId);
  });

  safeHandle('users:getActivity', userActivitySchema, (event, options) => {
    authService.requireAdmin();
    return authService.getUserActivity(options);
  });

  safeHandle('users:resetPassword', resetUserPasswordSchema, (event, data) => {
    authService.requireAdmin();
    return authService.resetUserPassword(data);
  });

  safeHandle('users:toggleActive', (event, userId) => {
    authService.requireAdmin();
    return authService.toggleUserActive(userId);
  });

  safeHandle('users:remove', (event, userId) => {
    authService.requireAdmin();
    return authService.removeUser(userId);
  });
}

module.exports = { registerUsersHandlers };