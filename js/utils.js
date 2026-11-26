/**
 * Utilidades compartidas: formato ARS, fechas en español (Argentina),
 * links de WhatsApp, Google Calendar (.ics), escape XSS y toasts.
 */

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatARS(amount) {
  const num = Number(amount || 0);
  return '$' + num.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

export function calcCashPrice(price, discountPercent = 10, eligible = true) {
  const p = Number(price || 0);
  if (!eligible || !discountPercent) return p;
  return Math.round((p * (100 - Number(discountPercent))) / 100);
}

export function getBuenosAiresNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const minute = Number(map.minute);
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const dow = new Date(Number(map.year), Number(map.month) - 1, Number(map.day)).getDay();
  return {
    dateStr,
    dow,
    minutesNow: hour * 60 + minute,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

export function addDays(dateStr, offset) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + offset);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

export function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DOW_SHORT[dow]} ${d} ${MONTH_SHORT[m - 1]}`;
}

export function formatDateLong(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DOW_LONG[dow]} ${d} de ${MONTH_SHORT[m - 1]}`;
}

export function getDateChipParts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return {
    dowShort: DOW_SHORT[dow],
    dayNum: String(d).padStart(2, '0'),
    monthShort: MONTH_SHORT[m - 1],
    dow,
  };
}

export function normalizeWaPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('549')) return digits;
  if (digits.startsWith('54')) return `549${digits.slice(2)}`;
  if (digits.startsWith('0')) return `549${digits.slice(1)}`;
  return `549${digits}`;
}

export function buildWhatsAppUrl(phone, message) {
  const clean = normalizeWaPhone(phone);
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function buildGoogleCalendarUrl(booking, settings) {
  const startDt = booking.date.replace(/-/g, '') + 'T' + booking.time.replace(':', '') + '00';
  const [h, m] = booking.time.split(':').map(Number);
  const endMin = h * 60 + m + Number(booking.durationMinutes || 30);
  const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
  const endM = String(endMin % 60).padStart(2, '0');
  const endDt = booking.date.replace(/-/g, '') + 'T' + endH + endM + '00';

  const title = `Turno Dual Barber · ${booking.serviceName}`;
  const details = `Barbero: ${booking.barberName}\nCódigo de reserva: ${booking.code}\nPrecio: ${formatARS(
    booking.price
  )} (${formatARS(booking.cashPrice)} en efectivo con ${settings.cashDiscountPercent}% OFF)`;
  const location = `${settings.address}, ${settings.city}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startDt}/${endDt}`,
    ctz: 'America/Argentina/Buenos_Aires',
    details,
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadICS(booking, settings) {
  const startDt = booking.date.replace(/-/g, '') + 'T' + booking.time.replace(':', '') + '00';
  const [h, m] = booking.time.split(':').map(Number);
  const endMin = h * 60 + m + Number(booking.durationMinutes || 30);
  const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
  const endM = String(endMin % 60).padStart(2, '0');
  const endDt = booking.date.replace(/-/g, '') + 'T' + endH + endM + '00';

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dual Barber//Turnos Online//ES',
    'BEGIN:VEVENT',
    `UID:${booking.code}@dualbarber.ar`,
    `DTSTART;TZID=America/Argentina/Buenos_Aires:${startDt}`,
    `DTEND;TZID=America/Argentina/Buenos_Aires:${endDt}`,
    `SUMMARY:Turno Dual Barber - ${booking.serviceName}`,
    `DESCRIPTION:Barbero: ${booking.barberName} | Código: ${booking.code}`,
    `LOCATION:${settings.address}, ${settings.city}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `turno-dual-barber-${booking.code}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function statusLabel(status) {
  switch (status) {
    case 'confirmed':
      return 'Confirmado';
    case 'in_progress':
      return 'En silla';
    case 'completed':
      return 'Completado';
    case 'cancelled':
      return 'Cancelado';
    case 'no_show':
      return 'Ausente';
    default:
      return status;
  }
}

export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.style.transition = 'opacity 200ms ease, transform 200ms ease';
    setTimeout(() => el.remove(), 220);
  }, 3600);
}

export const GOOGLE_G_SVG = `
<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88z"/>
  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24z"/>
  <path fill="#FBBC05" d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4.01-3.11z"/>
  <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4.01 3.11c.95-2.84 3.6-4.95 6.72-4.95z"/>
</svg>`;
