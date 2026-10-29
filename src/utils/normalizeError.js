export function normalizeErrorMessage(error, fallback = 'حدث خطأ غير متوقع') {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error?.message ?? error?.cause?.message ?? fallback;

  let cleaned = String(raw).replace(/\s+/g, ' ').trim();
  let previous;

  do {
    previous = cleaned;
    cleaned = cleaned
      .replace(/\s*:?\s*Error invoking remote method\s+['"][^'"]+['"]:\s*(?:Error)?\s*$/i, '')
      .replace(/^Error invoking remote method\s+['"][^'"]+['"]:\s*/i, '')
      .replace(/^Error invoking remote method.*?:\s*/i, '')
      .replace(/^Uncaught\s+/i, '')
      .replace(/^Remote error:\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim();
  } while (cleaned !== previous);

  return cleaned && cleaned !== 'Error' ? cleaned : fallback;
}

export default normalizeErrorMessage;