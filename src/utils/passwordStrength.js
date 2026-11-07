// 0 = empty, 1 = weak, 2 = medium, 3 = strong. A UI hint only; the backend enforces the real minimum.
export function passwordStrength(password = '') {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z؀-ۿ]/i.test(password) && /\d/.test(password)) score += 1;
  if (password.length >= 12 || /[^a-z0-9؀-ۿ]/i.test(password)) score += 1;
  return Math.max(1, score);
}

export const STRENGTH_LABELS = ['', 'ضعيفة', 'متوسطة', 'قوية'];
