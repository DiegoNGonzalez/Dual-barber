'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { createInitialData } = require('./data/seed');

// Cargar variables de entorno desde .env si existe (sin dependencias externas)
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('dual-barber-local-secret-v1').digest('hex');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
};

// -------------------------
// Persistencia atómica JSON
// -------------------------
let storeCache = null;

function ensureStore() {
  if (storeCache) return storeCache;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    storeCache = createInitialData();
    saveStore(storeCache);
  } else {
    try {
      storeCache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      if ((storeCache.version || 1) < 2) {
        if (storeCache.settings && storeCache.settings.slotIntervalMinutes === 15) {
          storeCache.settings.slotIntervalMinutes = 30;
        }
        storeCache.version = 2;
        saveStore(storeCache);
      }
    } catch {
      storeCache = createInitialData();
      saveStore(storeCache);
    }
  }
  return storeCache;
}

function saveStore(data) {
  storeCache = data;
  const tmpPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
}

// -------------------------
// Utilidades de tiempo (Argentina UTC-3)
// -------------------------
function getBuenosAiresNow() {
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
    epochMs: now.getTime(),
  };
}

function parseTimeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function getAppointmentUtcMs(dateStr, timeStr) {
  // Buenos Aires es UTC-03:00 sin horario de verano
  return Date.parse(`${dateStr}T${timeStr}:00-03:00`);
}

function computeOpenStatus(settings) {
  const now = getBuenosAiresNow();
  const todayHours = settings.hours[String(now.dow)];
  if (todayHours && todayHours.open) {
    const startMin = parseTimeToMinutes(todayHours.start);
    const endMin = parseTimeToMinutes(todayHours.end);
    if (now.minutesNow >= startMin && now.minutesNow < endMin) {
      return {
        isOpen: true,
        label: `Abierto ahora · Hasta las ${todayHours.end} hs`,
        currentDate: now.dateStr,
        currentTime: now.timeStr,
      };
    }
    if (now.minutesNow < startMin) {
      return {
        isOpen: false,
        label: `Hoy abrimos a las ${todayHours.start} hs`,
        currentDate: now.dateStr,
        currentTime: now.timeStr,
      };
    }
  }
  // Buscar próximo día abierto
  for (let offset = 1; offset <= 7; offset++) {
    const nextDow = (now.dow + offset) % 7;
    const h = settings.hours[String(nextDow)];
    if (h && h.open) {
      const dayLabel = offset === 1 ? 'Mañana' : h.label;
      return {
        isOpen: false,
        label: `Cerrado · Abrimos ${dayLabel} ${h.start} hs`,
        currentDate: now.dateStr,
        currentTime: now.timeStr,
      };
    }
  }
  return {
    isOpen: false,
    label: 'Cerrado temporalmente',
    currentDate: now.dateStr,
    currentTime: now.timeStr,
  };
}

// -------------------------
// Motor de disponibilidad
// -------------------------
function isBarberSlotFree(store, barber, dateStr, startMin, durationMin, excludeBookingId = null) {
  const endMin = startMin + durationMin;
  const dow = getDayOfWeek(dateStr);
  const shopDay = store.settings.hours[String(dow)];
  if (!shopDay || !shopDay.open) return false;
  if (!barber.active || !Array.isArray(barber.workDays) || !barber.workDays.includes(dow)) {
    return false;
  }

  const openMin = Math.max(parseTimeToMinutes(shopDay.start), parseTimeToMinutes(barber.startTime));
  const closeMin = Math.min(parseTimeToMinutes(shopDay.end), parseTimeToMinutes(barber.endTime));
  if (startMin < openMin || endMin > closeMin) return false;

  // Bloqueos (del barbero o globales 'all')
  for (const blk of store.blocks) {
    if (blk.date !== dateStr) continue;
    if (blk.barberId !== 'all' && blk.barberId !== barber.id) continue;
    const bStart = parseTimeToMinutes(blk.startTime);
    const bEnd = parseTimeToMinutes(blk.endTime);
    if (startMin < bEnd && endMin > bStart) return false;
  }

  // Turnos existentes activos
  for (const bk of store.bookings) {
    if (bk.id === excludeBookingId) continue;
    if (bk.date !== dateStr) continue;
    if (bk.barberId !== barber.id) continue;
    if (bk.status === 'cancelled' || bk.status === 'no_show') continue;
    const bkStart = parseTimeToMinutes(bk.time);
    const bkEnd = bkStart + Number(bk.durationMinutes || 30);
    if (startMin < bkEnd && endMin > bkStart) return false;
  }

  return true;
}

function getAvailability(store, { date, serviceId, barberId = 'any', excludeBookingId = null, bypassNotice = false }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'Fecha inválida. Usá formato AAAA-MM-DD.' };
  }
  const service = store.services.find((s) => s.id === serviceId && s.active);
  if (!service) {
    return { error: 'Servicio no encontrado o inactivo.' };
  }

  const dow = getDayOfWeek(date);
  const shopDay = store.settings.hours[String(dow)];
  if (!shopDay || !shopDay.open) {
    return {
      date,
      closed: true,
      reason: `Los ${shopDay ? shopDay.label.toLowerCase() + 's' : 'días seleccionados'} permanecemos cerrados.`,
      slots: [],
    };
  }

  const activeBarbers = store.barbers.filter((b) => b.active);
  const candidateBarbers =
    barberId === 'any'
      ? activeBarbers
      : activeBarbers.filter((b) => b.id === barberId);

  if (candidateBarbers.length === 0) {
    return { date, closed: false, reason: 'Profesional no disponible.', slots: [] };
  }

  const now = getBuenosAiresNow();
  if (!bypassNotice && date < now.dateStr) {
    return { date, closed: false, reason: 'No se pueden agendar fechas pasadas.', slots: [] };
  }

  const interval = Math.max(15, Number(store.settings.slotIntervalMinutes || 30));
  const duration = Number(service.durationMinutes || 30);
  const minNotice = bypassNotice ? 0 : Number(store.settings.minNoticeMinutes || 60);

  const shopStart = parseTimeToMinutes(shopDay.start);
  const shopEnd = parseTimeToMinutes(shopDay.end);
  const slots = [];

  for (let min = shopStart; min + duration <= shopEnd; min += interval) {
    // Regla de 1 hora de anticipación si es el día actual
    if (!bypassNotice && date === now.dateStr && min < now.minutesNow + minNotice) {
      continue;
    }

    const freeBarbers = candidateBarbers.filter((b) =>
      isBarberSlotFree(store, b, date, min, duration, excludeBookingId)
    );

    if (freeBarbers.length > 0) {
      slots.push({
        time: minutesToTime(min),
        availableBarberIds: freeBarbers.map((b) => b.id),
      });
    }
  }

  return {
    date,
    closed: false,
    dayLabel: shopDay.label,
    hours: `${shopDay.start} - ${shopDay.end}`,
    slots,
  };
}

function pickBestBarberForSlot(store, availableBarberIds, dateStr) {
  if (availableBarberIds.length === 1) return availableBarberIds[0];
  // Balancear carga diaria entre Agus y Lucho
  const counts = {};
  for (const id of availableBarberIds) counts[id] = 0;
  for (const bk of store.bookings) {
    if (bk.date === dateStr && bk.status !== 'cancelled' && counts[bk.barberId] !== undefined) {
      counts[bk.barberId]++;
    }
  }
  return [...availableBarberIds].sort((a, b) => counts[a] - counts[b])[0];
}

function generateBookingCode(store) {
  const existing = new Set(store.bookings.map((b) => b.code));
  for (let i = 0; i < 50; i++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = `DUAL-${num}`;
    if (!existing.has(code)) return code;
  }
  return `DUAL-${Date.now().toString().slice(-5)}`;
}

function computeCashPrice(price, discountPercent, eligible = true) {
  const p = Number(price || 0);
  if (!eligible || !discountPercent) return p;
  return Math.round((p * (100 - Number(discountPercent))) / 100);
}

// -------------------------
// Autenticación de Admin
// -------------------------
function signAdminToken() {
  const payload = Buffer.from(
    JSON.stringify({ role: 'admin', exp: Date.now() + 1000 * 60 * 60 * 24 })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.role === 'admin' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function sanitizeSettingsForPublic(settings) {
  const copy = { ...settings };
  delete copy.adminPin;
  return copy;
}

// -------------------------
// Helpers HTTP
// -------------------------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// -------------------------
// Sincronización opcional con Google Places API (New)
// -------------------------
async function syncGooglePlacesReviews(store) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  const placeId = store.settings.googlePlaceId || process.env.GOOGLE_PLACE_ID || '';

  if (!apiKey || !placeId) {
    return {
      ok: false,
      configured: false,
      message:
        'Para sincronizar automáticamente desde Google Maps, configurá GOOGLE_PLACES_API_KEY en el archivo .env del servidor y cargá el Google Place ID del local acá abajo. Mientras tanto podés editar la calificación y reseñas manualmente.',
    };
  }

  const endpoint = `https://places.googleapis.com/v1/places/${encodeURIComponent(
    placeId
  )}?languageCode=es-419`;

  const response = await fetch(endpoint, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews,googleMapsUri',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    return {
      ok: false,
      configured: true,
      message: `Google Places respondió con error (${response.status}). Verificá tu API Key y Place ID.`,
      detail: errText.slice(0, 200),
    };
  }

  const data = await response.json();
  if (typeof data.rating === 'number') {
    store.settings.googleRating = Number(data.rating.toFixed(1));
  }
  if (typeof data.userRatingCount === 'number') {
    store.settings.googleReviewCount = data.userRatingCount;
  }
  if (data.googleMapsUri) {
    store.settings.googleMapsUrl = data.googleMapsUri;
  }
  store.settings.googleLastSync = getBuenosAiresNow().dateStr;

  if (Array.isArray(data.reviews) && data.reviews.length > 0) {
    const synced = data.reviews
      .filter((r) => r.text && r.text.text)
      .map((r, idx) => ({
        id: `rev-g-${Date.now()}-${idx}`,
        author: (r.authorAttribution && r.authorAttribution.displayName) || 'Cliente de Google',
        rating: Number(r.rating || 5),
        source: 'Google Maps',
        service: 'Reseña verificada',
        date: (r.publishTime || '').slice(0, 10) || getBuenosAiresNow().dateStr,
        text: r.text.text,
        featured: idx < 6,
      }));
    if (synced.length > 0) {
      store.reviews = synced;
    }
  }

  saveStore(store);
  return {
    ok: true,
    configured: true,
    rating: store.settings.googleRating,
    reviewCount: store.settings.googleReviewCount,
    reviewsCountSynced: store.reviews.length,
  };
}

// -------------------------
// Router API
// -------------------------
async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const store = ensureStore();

  // 1. PUBLIC: Bootstrap inicial
  if (method === 'GET' && pathname === '/api/public/bootstrap') {
    return sendJson(res, 200, {
      settings: sanitizeSettingsForPublic(store.settings),
      services: store.services
        .filter((s) => s.active)
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
      barbers: store.barbers.filter((b) => b.active),
      reviews: store.reviews,
      openStatus: computeOpenStatus(store.settings),
      serverTime: getBuenosAiresNow(),
      mode: 'server',
    });
  }

  // 2. PUBLIC: Disponibilidad de horarios
  if (method === 'GET' && pathname === '/api/availability') {
    const date = parsedUrl.searchParams.get('date');
    const serviceId = parsedUrl.searchParams.get('serviceId');
    const barberId = parsedUrl.searchParams.get('barberId') || 'any';
    const excludeBookingId = parsedUrl.searchParams.get('excludeBookingId') || null;
    const bypassNotice =
      parsedUrl.searchParams.get('admin') === '1' && verifyAdminToken(req);

    const result = getAvailability(store, {
      date,
      serviceId,
      barberId,
      excludeBookingId,
      bypassNotice,
    });
    if (result.error) return sendJson(res, 400, result);
    return sendJson(res, 200, result);
  }

  // 3. PUBLIC: Crear reserva
  if (method === 'POST' && pathname === '/api/bookings') {
    const body = await readJsonBody(req);
    const {
      serviceId,
      barberId = 'any',
      date,
      time,
      clientName,
      clientPhone,
      clientEmail = '',
      notes = '',
    } = body;

    if (!serviceId || !date || !time || !clientName || !clientPhone) {
      return sendJson(res, 400, {
        error: 'Completá servicio, fecha, horario, nombre y WhatsApp para confirmar tu turno.',
      });
    }

    const cleanName = String(clientName).trim().slice(0, 80);
    const cleanPhone = String(clientPhone).trim().slice(0, 30);
    if (cleanName.length < 2 || normalizePhoneDigits(cleanPhone).length < 8) {
      return sendJson(res, 400, {
        error: 'Ingresá un nombre válido y un número de WhatsApp real (al menos 8 dígitos).',
      });
    }

    const service = store.services.find((s) => s.id === serviceId && s.active);
    if (!service) {
      return sendJson(res, 404, { error: 'El servicio seleccionado ya no está disponible.' });
    }

    const availability = getAvailability(store, { date, serviceId, barberId });
    if (availability.error) return sendJson(res, 400, availability);
    const slotMatch = (availability.slots || []).find((s) => s.time === time);
    if (!slotMatch) {
      return sendJson(res, 409, {
        error:
          'Ese horario acaba de ser ocupado o no cumple con la anticipación mínima de 1 hora. Elegí otro horario disponible.',
      });
    }

    const assignedBarberId = pickBestBarberForSlot(store, slotMatch.availableBarberIds, date);
    const barber = store.barbers.find((b) => b.id === assignedBarberId);
    const cashPrice = computeCashPrice(
      service.price,
      store.settings.cashDiscountPercent,
      service.cashDiscountEligible
    );

    const booking = {
      id: `bk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      code: generateBookingCode(store),
      serviceId: service.id,
      serviceName: service.name,
      durationMinutes: Number(service.durationMinutes),
      price: Number(service.price),
      cashPrice,
      barberId: barber.id,
      barberName: barber.name,
      date,
      time,
      clientName: cleanName,
      clientPhone: cleanPhone,
      clientEmail: String(clientEmail || '').trim().slice(0, 120),
      notes: String(notes || '').trim().slice(0, 240),
      status: 'confirmed',
      paymentMethod: null,
      finalAmount: null,
      modificationsCount: 0,
      source: 'web',
      createdAt: new Date().toISOString(),
    };

    store.bookings.push(booking);
    saveStore(store);

    return sendJson(res, 201, { booking });
  }

  // 4. PUBLIC: Buscar turnos del cliente ("Mis Turnos")
  if (method === 'GET' && pathname === '/api/bookings/lookup') {
    const query = (parsedUrl.searchParams.get('query') || '').trim();
    if (!query || query.length < 4) {
      return sendJson(res, 400, {
        error: 'Ingresá tu código de reserva (ej. DUAL-4821) o tu número de WhatsApp.',
      });
    }
    const upper = query.toUpperCase();
    const digits = normalizePhoneDigits(query);

    const matches = store.bookings
      .filter((bk) => {
        if (bk.code.toUpperCase() === upper) return true;
        if (digits.length >= 7) {
          const bkDigits = normalizePhoneDigits(bk.clientPhone);
          return bkDigits.endsWith(digits.slice(-8)) || digits.endsWith(bkDigits.slice(-8));
        }
        return false;
      })
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    return sendJson(res, 200, { bookings: matches });
  }

  // 5. PUBLIC: Reprogramar turno del cliente
  const rescheduleMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/reschedule$/);
  if (method === 'POST' && rescheduleMatch) {
    const code = decodeURIComponent(rescheduleMatch[1]).toUpperCase();
    const body = await readJsonBody(req);
    const { date, time, barberId } = body;

    const bk = store.bookings.find((b) => b.code.toUpperCase() === code);
    if (!bk) return sendJson(res, 404, { error: 'Reserva no encontrada.' });
    if (bk.status !== 'confirmed') {
      return sendJson(res, 400, { error: 'Solo se pueden modificar turnos confirmados.' });
    }

    const maxMods = Number(store.settings.maxModifications || 4);
    if ((bk.modificationsCount || 0) >= maxMods) {
      return sendJson(res, 400, {
        error: `Alcanzaste el límite de ${maxMods} modificaciones para este turno. Escribinos por WhatsApp si necesitás ayuda.`,
      });
    }

    const cancelNoticeMin = Number(store.settings.cancelNoticeMinutes || 60);
    const currentApptMs = getAppointmentUtcMs(bk.date, bk.time);
    if (currentApptMs - Date.now() < cancelNoticeMin * 60 * 1000) {
      return sendJson(res, 400, {
        error: `Los turnos solo pueden modificarse con al menos ${cancelNoticeMin} minutos de anticipación.`,
      });
    }

    const targetBarber = barberId || bk.barberId;
    const avail = getAvailability(store, {
      date,
      serviceId: bk.serviceId,
      barberId: targetBarber,
      excludeBookingId: bk.id,
    });
    if (avail.error) return sendJson(res, 400, avail);
    const slotMatch = (avail.slots || []).find((s) => s.time === time);
    if (!slotMatch) {
      return sendJson(res, 409, { error: 'El nuevo horario elegido ya no está disponible.' });
    }

    const chosenBarberId = pickBestBarberForSlot(store, slotMatch.availableBarberIds, date);
    const barber = store.barbers.find((b) => b.id === chosenBarberId);

    bk.date = date;
    bk.time = time;
    bk.barberId = barber.id;
    bk.barberName = barber.name;
    bk.modificationsCount = (bk.modificationsCount || 0) + 1;
    bk.updatedAt = new Date().toISOString();

    saveStore(store);
    return sendJson(res, 200, { booking: bk });
  }

  // 6. PUBLIC: Cancelar turno del cliente
  const cancelMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
  if (method === 'POST' && cancelMatch) {
    const code = decodeURIComponent(cancelMatch[1]).toUpperCase();
    const bk = store.bookings.find((b) => b.code.toUpperCase() === code);
    if (!bk) return sendJson(res, 404, { error: 'Reserva no encontrada.' });
    if (bk.status !== 'confirmed') {
      return sendJson(res, 400, { error: 'Este turno ya no está activo.' });
    }

    const cancelNoticeMin = Number(store.settings.cancelNoticeMinutes || 60);
    const currentApptMs = getAppointmentUtcMs(bk.date, bk.time);
    if (currentApptMs - Date.now() < cancelNoticeMin * 60 * 1000) {
      return sendJson(res, 400, {
        error: `Para cancelar con menos de ${cancelNoticeMin} minutos de anticipación, avisanos por WhatsApp.`,
      });
    }

    bk.status = 'cancelled';
    bk.cancelledBy = 'client';
    bk.updatedAt = new Date().toISOString();
    saveStore(store);
    return sendJson(res, 200, { booking: bk });
  }

  // 7. ADMIN LOGIN
  if (method === 'POST' && pathname === '/api/admin/login') {
    const body = await readJsonBody(req);
    const expectedPin = String(store.settings.adminPin || '2026');
    const providedPin = String(body.pin || '').trim();
    if (providedPin !== expectedPin) {
      return sendJson(res, 401, { error: 'PIN incorrecto. Probá nuevamente.' });
    }
    return sendJson(res, 200, {
      token: signAdminToken(),
      brandName: store.settings.brandName,
    });
  }

  // A partir de aquí todas las rutas /api/admin/* requieren token válido
  if (pathname.startsWith('/api/admin/')) {
    if (!verifyAdminToken(req)) {
      return sendJson(res, 401, { error: 'Sesión expirada o no autorizada.' });
    }

    // GET estado completo para el panel
    if (method === 'GET' && pathname === '/api/admin/state') {
      return sendJson(res, 200, {
        settings: sanitizeSettingsForPublic(store.settings),
        services: store.services.sort((a, b) => (a.order || 0) - (b.order || 0)),
        barbers: store.barbers,
        bookings: store.bookings,
        blocks: store.blocks,
        reviews: store.reviews,
        googlePlacesConfigured: Boolean(
          process.env.GOOGLE_PLACES_API_KEY &&
            (store.settings.googlePlaceId || process.env.GOOGLE_PLACE_ID)
        ),
        serverTime: getBuenosAiresNow(),
      });
    }

    // ADMIN: Crear turno manual (walk-in / WhatsApp)
    if (method === 'POST' && pathname === '/api/admin/bookings') {
      const body = await readJsonBody(req);
      const {
        serviceId,
        barberId,
        date,
        time,
        clientName,
        clientPhone = '',
        clientEmail = '',
        notes = '',
      } = body;

      const service = store.services.find((s) => s.id === serviceId);
      const barber = store.barbers.find((b) => b.id === barberId);
      if (!service || !barber || !date || !time || !clientName) {
        return sendJson(res, 400, { error: 'Faltan datos obligatorios para agendar el turno.' });
      }

      const startMin = parseTimeToMinutes(time);
      const free = isBarberSlotFree(store, barber, date, startMin, Number(service.durationMinutes));
      if (!free) {
        return sendJson(res, 409, {
          error: `${barber.nickname || barber.name} ya tiene ocupado o bloqueado ese horario.`,
        });
      }

      const booking = {
        id: `bk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
        code: generateBookingCode(store),
        serviceId: service.id,
        serviceName: service.name,
        durationMinutes: Number(service.durationMinutes),
        price: Number(service.price),
        cashPrice: computeCashPrice(
          service.price,
          store.settings.cashDiscountPercent,
          service.cashDiscountEligible
        ),
        barberId: barber.id,
        barberName: barber.name,
        date,
        time,
        clientName: String(clientName).trim().slice(0, 80),
        clientPhone: String(clientPhone || '').trim().slice(0, 30),
        clientEmail: String(clientEmail || '').trim().slice(0, 120),
        notes: String(notes || '').trim().slice(0, 240),
        status: 'confirmed',
        paymentMethod: null,
        finalAmount: null,
        modificationsCount: 0,
        source: 'manual',
        createdAt: new Date().toISOString(),
      };

      store.bookings.push(booking);
      saveStore(store);
      return sendJson(res, 201, { booking });
    }

    // ADMIN: Actualizar / eliminar turno
    const adminBkMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
    if (adminBkMatch) {
      const id = decodeURIComponent(adminBkMatch[1]);
      const idx = store.bookings.findIndex((b) => b.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'Turno no encontrado.' });

      if (method === 'DELETE') {
        store.bookings.splice(idx, 1);
        saveStore(store);
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const bk = store.bookings[idx];

        if (body.date || body.time || body.barberId) {
          const nextDate = body.date || bk.date;
          const nextTime = body.time || bk.time;
          const nextBarberId = body.barberId || bk.barberId;
          const barber = store.barbers.find((b) => b.id === nextBarberId);
          if (!barber) return sendJson(res, 400, { error: 'Barbero inválido.' });
          const free = isBarberSlotFree(
            store,
            barber,
            nextDate,
            parseTimeToMinutes(nextTime),
            Number(bk.durationMinutes),
            bk.id
          );
          if (!free) {
            return sendJson(res, 409, {
              error: 'El horario elegido se superpone con otro turno o bloqueo.',
            });
          }
          bk.date = nextDate;
          bk.time = nextTime;
          bk.barberId = barber.id;
          bk.barberName = barber.name;
        }

        if (body.status) bk.status = body.status;
        if (body.paymentMethod !== undefined) bk.paymentMethod = body.paymentMethod;
        if (body.finalAmount !== undefined) {
          bk.finalAmount = body.finalAmount === null ? null : Number(body.finalAmount);
        }
        if (body.notes !== undefined) bk.notes = String(body.notes).trim().slice(0, 240);
        bk.updatedAt = new Date().toISOString();

        saveStore(store);
        return sendJson(res, 200, { booking: bk });
      }
    }

    // ADMIN: Servicios CRUD
    if (method === 'POST' && pathname === '/api/admin/services') {
      const body = await readJsonBody(req);
      if (!body.name || !body.price || !body.durationMinutes) {
        return sendJson(res, 400, { error: 'Completá nombre, precio y duración del servicio.' });
      }
      const service = {
        id: `srv-${Date.now()}`,
        name: String(body.name).trim().slice(0, 70),
        durationMinutes: Math.max(15, Number(body.durationMinutes)),
        price: Math.max(0, Number(body.price)),
        cashDiscountEligible: body.cashDiscountEligible !== false,
        badge: String(body.badge || '').trim().slice(0, 30),
        description: String(body.description || '').trim().slice(0, 260),
        includes: Array.isArray(body.includes) ? body.includes : [],
        image: body.image || 'assets/work-fade-1.png',
        active: body.active !== false,
        order: store.services.length + 1,
      };
      store.services.push(service);
      saveStore(store);
      return sendJson(res, 201, { service });
    }

    const adminSrvMatch = pathname.match(/^\/api\/admin\/services\/([^/]+)$/);
    if (adminSrvMatch) {
      const id = decodeURIComponent(adminSrvMatch[1]);
      const idx = store.services.findIndex((s) => s.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'Servicio no encontrado.' });

      if (method === 'DELETE') {
        store.services.splice(idx, 1);
        saveStore(store);
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const srv = store.services[idx];
        if (body.name !== undefined) srv.name = String(body.name).trim().slice(0, 70);
        if (body.price !== undefined) srv.price = Math.max(0, Number(body.price));
        if (body.durationMinutes !== undefined) {
          srv.durationMinutes = Math.max(15, Number(body.durationMinutes));
        }
        if (body.cashDiscountEligible !== undefined) {
          srv.cashDiscountEligible = Boolean(body.cashDiscountEligible);
        }
        if (body.badge !== undefined) srv.badge = String(body.badge).trim().slice(0, 30);
        if (body.description !== undefined) {
          srv.description = String(body.description).trim().slice(0, 260);
        }
        if (body.image !== undefined && body.image) srv.image = String(body.image).trim();
        if (body.active !== undefined) srv.active = Boolean(body.active);
        saveStore(store);
        return sendJson(res, 200, { service: srv });
      }
    }

    // ADMIN: Barberos CRUD
    if (method === 'POST' && pathname === '/api/admin/barbers') {
      const body = await readJsonBody(req);
      if (!body.name) return sendJson(res, 400, { error: 'Ingresá el nombre del barbero.' });
      const barber = {
        id: `barber-${Date.now()}`,
        name: String(body.name).trim().slice(0, 60),
        nickname: String(body.nickname || body.name.split(' ')[0]).trim().slice(0, 30),
        role: String(body.role || 'Barber').trim().slice(0, 60),
        specialty: String(body.specialty || 'Cortes modernos y barba.').trim().slice(0, 160),
        rating: 5.0,
        reviewCount: 0,
        workDays: Array.isArray(body.workDays) ? body.workDays.map(Number) : [2, 3, 4, 5, 6],
        startTime: body.startTime || '11:00',
        endTime: body.endTime || '20:00',
        photo: body.photo || 'assets/barber-agustin.jpg',
        active: true,
      };
      store.barbers.push(barber);
      saveStore(store);
      return sendJson(res, 201, { barber });
    }

    const adminBarberMatch = pathname.match(/^\/api\/admin\/barbers\/([^/]+)$/);
    if (adminBarberMatch && method === 'PATCH') {
      const id = decodeURIComponent(adminBarberMatch[1]);
      const barber = store.barbers.find((b) => b.id === id);
      if (!barber) return sendJson(res, 404, { error: 'Profesional no encontrado.' });
      const body = await readJsonBody(req);
      if (body.name !== undefined) barber.name = String(body.name).trim().slice(0, 60);
      if (body.nickname !== undefined) barber.nickname = String(body.nickname).trim().slice(0, 30);
      if (body.role !== undefined) barber.role = String(body.role).trim().slice(0, 60);
      if (body.specialty !== undefined) barber.specialty = String(body.specialty).trim().slice(0, 160);
      if (Array.isArray(body.workDays)) barber.workDays = body.workDays.map(Number);
      if (body.startTime !== undefined) barber.startTime = body.startTime;
      if (body.endTime !== undefined) barber.endTime = body.endTime;
      if (body.photo !== undefined && body.photo) barber.photo = String(body.photo).trim();
      if (body.active !== undefined) barber.active = Boolean(body.active);
      saveStore(store);
      return sendJson(res, 200, { barber });
    }

    // ADMIN: Bloqueos de agenda
    if (method === 'POST' && pathname === '/api/admin/blocks') {
      const body = await readJsonBody(req);
      if (!body.date || !body.startTime || !body.endTime) {
        return sendJson(res, 400, { error: 'Indicá fecha, hora desde y hora hasta.' });
      }
      if (parseTimeToMinutes(body.endTime) <= parseTimeToMinutes(body.startTime)) {
        return sendJson(res, 400, { error: 'La hora de fin debe ser posterior a la de inicio.' });
      }
      const block = {
        id: `blk-${Date.now()}`,
        barberId: body.barberId || 'all',
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        reason: String(body.reason || 'Bloqueo manual').trim().slice(0, 80),
      };
      store.blocks.push(block);
      saveStore(store);
      return sendJson(res, 201, { block });
    }

    const adminBlockMatch = pathname.match(/^\/api\/admin\/blocks\/([^/]+)$/);
    if (adminBlockMatch && method === 'DELETE') {
      const id = decodeURIComponent(adminBlockMatch[1]);
      store.blocks = store.blocks.filter((b) => b.id !== id);
      saveStore(store);
      return sendJson(res, 200, { ok: true });
    }

    // ADMIN: Reseñas CRUD
    if (method === 'POST' && pathname === '/api/admin/reviews') {
      const body = await readJsonBody(req);
      if (!body.author || !body.text) {
        return sendJson(res, 400, { error: 'Ingresá el nombre del cliente y el comentario.' });
      }
      const review = {
        id: `rev-${Date.now()}`,
        author: String(body.author).trim().slice(0, 60),
        rating: Math.min(5, Math.max(1, Number(body.rating || 5))),
        source: String(body.source || 'Google Maps').trim().slice(0, 40),
        service: String(body.service || 'Corte de Cabello').trim().slice(0, 60),
        date: body.date || getBuenosAiresNow().dateStr,
        text: String(body.text).trim().slice(0, 400),
        featured: body.featured !== false,
      };
      store.reviews.unshift(review);
      saveStore(store);
      return sendJson(res, 201, { review });
    }

    const adminRevMatch = pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
    if (adminRevMatch) {
      const id = decodeURIComponent(adminRevMatch[1]);
      const idx = store.reviews.findIndex((r) => r.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'Reseña no encontrada.' });

      if (method === 'DELETE') {
        store.reviews.splice(idx, 1);
        saveStore(store);
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        if (body.featured !== undefined) store.reviews[idx].featured = Boolean(body.featured);
        if (body.text !== undefined) store.reviews[idx].text = String(body.text).trim().slice(0, 400);
        if (body.author !== undefined) store.reviews[idx].author = String(body.author).trim().slice(0, 60);
        saveStore(store);
        return sendJson(res, 200, { review: store.reviews[idx] });
      }
    }

    // ADMIN: Configuración general & Google Maps
    if (method === 'PATCH' && pathname === '/api/admin/settings') {
      const body = await readJsonBody(req);
      const allowed = [
        'tagline',
        'heroHeadline',
        'aboutText',
        'address',
        'addressReference',
        'whatsappPrimary',
        'whatsappPrimaryDisplay',
        'whatsappSecondary',
        'whatsappSecondaryDisplay',
        'instagramHandle',
        'instagramUrl',
        'googleMapsUrl',
        'googleRating',
        'googleReviewCount',
        'googlePlaceId',
        'cashDiscountPercent',
        'minNoticeMinutes',
        'cancelNoticeMinutes',
        'maxModifications',
        'slotIntervalMinutes',
        'bookingHorizonDays',
        'hours',
      ];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          store.settings[key] = body[key];
        }
      }
      if (body.newAdminPin && String(body.newAdminPin).trim().length >= 4) {
        store.settings.adminPin = String(body.newAdminPin).trim().slice(0, 16);
      }
      saveStore(store);
      return sendJson(res, 200, { settings: sanitizeSettingsForPublic(store.settings) });
    }

    // ADMIN: Sincronizar Google Places API
    if (method === 'POST' && pathname === '/api/admin/google-reviews/sync') {
      const result = await syncGooglePlacesReviews(store);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // ADMIN: Importar backup JSON
    if (method === 'POST' && pathname === '/api/admin/import') {
      const body = await readJsonBody(req);
      if (!body || !body.settings || !Array.isArray(body.services) || !Array.isArray(body.barbers)) {
        return sendJson(res, 400, { error: 'Archivo de respaldo inválido.' });
      }
      const preservedPin = store.settings.adminPin;
      body.settings.adminPin = preservedPin;
      saveStore(body);
      return sendJson(res, 200, { ok: true });
    }

    // ADMIN: Reset demo
    if (method === 'POST' && pathname === '/api/admin/reset-demo') {
      const fresh = createInitialData();
      fresh.settings.adminPin = store.settings.adminPin;
      saveStore(fresh);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: 'Endpoint no encontrado.' });
}

// -------------------------
// Servidor de archivos estáticos
// -------------------------
function serveStatic(req, res, parsedUrl) {
  let reqPath = parsedUrl.pathname;
  if (reqPath === '/') reqPath = '/index.html';
  if (reqPath === '/admin' || reqPath === '/admin/') reqPath = '/admin.html';

  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, safePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isAsset = reqPath.startsWith('/assets/');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(fullPath).pipe(res);
  });
}

// -------------------------
// Arranque HTTP Server
// -------------------------
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (parsedUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, parsedUrl);
      return;
    }

    serveStatic(req, res, parsedUrl);
  } catch (err) {
    if (err && err.message === 'INVALID_JSON') {
      return sendJson(res, 400, { error: 'JSON mal formado.' });
    }
    if (err && err.message === 'PAYLOAD_TOO_LARGE') {
      return sendJson(res, 413, { error: 'Solicitud demasiado grande.' });
    }
    console.error('[Dual Barber Server Error]', err);
    return sendJson(res, 500, { error: 'Error interno del servidor.' });
  }
});

ensureStore();

server.listen(PORT, HOST, () => {
  console.log(`Dual Barber server activo en http://localhost:${PORT}`);
  console.log(`Panel de gestión para barberos: http://localhost:${PORT}/admin.html`);
});
