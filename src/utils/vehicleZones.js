// Names the part of the car under a tap on the top-view diagram. x, y are percent of the diagram box
// (front of the car at the top). "Right" is the car's right = the viewer's right, as on the paper receipt.
export function zoneOf(x, y) {
  const side = x < 35 ? 'الأيسر' : x > 65 ? 'الأيمن' : null;
  if (!side) {
    if (y < 12) return 'الصدام الأمامي';
    if (y < 30) return 'الكبوت';
    if (y < 72) return 'السقف';
    if (y < 90) return 'شنطة السيارة';
    return 'الصدام الخلفي';
  }
  if (y < 12) return `الفانوس الأمامي ${side}`;
  if (y < 32) return `الرفرف الأمامي ${side}`;
  if (y < 56) return `الباب الأمامي ${side}`;
  if (y < 72) return `الباب الخلفي ${side}`;
  if (y < 90) return `الرفرف الخلفي ${side}`;
  return `الفانوس الخلفي ${side}`;
}

/** Shrinks a photo to at most `max` pixels on its long side and returns a JPEG data URL (keeps the database small). */
export async function photoToDataUrl(file, max = 900, quality = 0.72) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}
