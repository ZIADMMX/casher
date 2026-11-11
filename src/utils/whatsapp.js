// Free WhatsApp "click to chat": opens the chat with the message typed in; the user presses send.
// shortcut: assumes Egyptian local numbers (01xxxxxxxxx), add a country setting if the app sells abroad.
export const whatsappUrl = (phone, text = '') => {
  const digits = String(phone).replace(/\D/g, '');
  const number = digits.startsWith('0') ? `20${digits.slice(1)}` : digits;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

/** Opens WhatsApp in the browser/app (main.js sends https window.open calls to the system). */
export const openWhatsapp = (phone, text) => window.open(whatsappUrl(phone, text), '_blank');
