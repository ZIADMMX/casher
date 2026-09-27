/**
 * أداة مساعدة لتنسيق مسار الصورة ليتوافق مع بروتوكول Electron الآمن kashiear-media://
 * يحل مشكلة حظر المتصفح "Not allowed to load local resource" تماماً
 * ويعمل بكفاءة عبر أنظمة Windows و Linux و macOS
 */
export function formatProductImageUrl(imagePath) {
  if (!imagePath) return '';
  
  // إذا كانت الصورة base64 dataUrl أو رابط خارجي
  if (
    imagePath.startsWith('data:') ||
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://') ||
    imagePath.startsWith('kashiear-media://')
  ) {
    return imagePath;
  }

  // تنظيف أي بادئة file:// قديمة
  let cleanPath = imagePath.replace(/^file:\/\//, '');

  // توحيد الفواصل لتكون سلاش أمامي (/)
  cleanPath = cleanPath.replace(/\\/g, '/');

  return `kashiear-media://${cleanPath}`;
}
