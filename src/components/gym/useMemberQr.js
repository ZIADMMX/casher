import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as subscriptionsApi from '../../api/subscriptions.js';

/**
 * The member's QR image. It carries the member's own secret card code ("GM-<id>-<secret>"), so every card
 * is different. If that code cannot be loaded it falls back to the plain "GM-<id>", which the gate still accepts.
 */
export default function useMemberQr(customerId, size = 240) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    setUrl('');
    if (!customerId) return undefined;
    Promise.resolve()
      .then(() => subscriptionsApi.getGymMemberCode(customerId))
      .then((r) => r.qr, () => `GM-${customerId}`)
      .then((text) => QRCode.toDataURL(text, { margin: 1, width: size, errorCorrectionLevel: 'M' }))
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(''));
    return () => { alive = false; };
  }, [customerId, size]);
  return url;
}
