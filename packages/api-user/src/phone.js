const RU_E164_RE = /^\+7[0-9]{10}$/;

function digitsOnly(s) {
  return String(s).replace(/\D/g, '');
}

/**
 * Нормализует российский номер в +79001234567.
 * @returns {string|null}
 */
function normalizeRuPhone(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  let d = digitsOnly(raw);
  if (d.startsWith('8') && d.length === 11) {
    d = `7${d.slice(1)}`;
  }
  if (d.length === 10) {
    d = `7${d}`;
  }
  if (d.length === 11 && d.startsWith('7')) {
    const e164 = `+${d}`;
    return RU_E164_RE.test(e164) ? e164 : null;
  }
  if (raw.startsWith('+') && RU_E164_RE.test(raw.replace(/\s/g, ''))) {
    return raw.replace(/\s/g, '');
  }
  return null;
}

function maskPhone(phone) {
  if (!phone || phone.length < 6) return '***';
  return `${phone.slice(0, 2)}***${phone.slice(-4)}`;
}

module.exports = { normalizeRuPhone, maskPhone, RU_E164_RE };
