import {
  createClientSeed,
  loadLocalStore,
  localComputeOpenStatus,
  localCreateBooking,
  localGetAvailability,
  saveLocalStore,
} from './seed-client.js';
import { getBuenosAiresNow } from './utils.js';

/**
 * Cliente API híbrido:
 * - Si el servidor Node.js (/api/*) está activo, usa la base de datos del servidor.
 * - Si se despliega como sitio estático (ej. GitHub Pages para demo), usa localStorage automáticamente.
 */

let useLocalMode =
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('.github.io') || window.location.protocol === 'file:');
const TOKEN_KEY = 'dual_barber_admin_token';

export function getAdminToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setAdminToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function isLocalFallbackMode() {
  return useLocalMode;
}

async function serverFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('NOT_API_SERVER');
  }
  if (!res.ok) {
    const err = new Error(json.error || json.message || `Error HTTP ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

// ==========================================
// ENDPOINTS PÚBLICOS
// ==========================================
export async function getPublicBootstrap() {
  if (!useLocalMode) {
    try {
      return await serverFetch('/api/public/bootstrap');
    } catch (err) {
      if (!err.status) {
        useLocalMode = true;
      } else {
        throw err;
      }
    }
  }
  const store = loadLocalStore();
  return {
    settings: store.settings,
    services: store.services.filter((s) => s.active).sort((a, b) => (a.order || 0) - (b.order || 0)),
    barbers: store.barbers.filter((b) => b.active),
    reviews: store.reviews,
    openStatus: localComputeOpenStatus(store.settings),
    serverTime: getBuenosAiresNow(),
    mode: 'local',
  };
}

export async function getAvailability({ date, serviceId, barberId = 'any', excludeBookingId = '', admin = false }) {
  if (!useLocalMode) {
    const qs = new URLSearchParams({ date, serviceId, barberId });
    if (excludeBookingId) qs.set('excludeBookingId', excludeBookingId);
    if (admin) qs.set('admin', '1');
    return serverFetch(`/api/availability?${qs.toString()}`);
  }
  const store = loadLocalStore();
  return localGetAvailability(store, {
    date,
    serviceId,
    barberId,
    excludeBookingId: excludeBookingId || null,
    bypassNotice: admin,
  });
}

export async function createBooking(payload) {
  if (!useLocalMode) {
    return serverFetch('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
  }
  const store = loadLocalStore();
  return { booking: localCreateBooking(store, payload, false) };
}

export async function lookupBookings(query) {
  if (!useLocalMode) {
    return serverFetch(`/api/bookings/lookup?query=${encodeURIComponent(query)}`);
  }
  const store = loadLocalStore();
  const upper = query.trim().toUpperCase();
  const digits = query.replace(/\D/g, '');
  const matches = store.bookings.filter((b) => {
    if (b.code.toUpperCase() === upper) return true;
    if (digits.length >= 7) {
      const bd = (b.clientPhone || '').replace(/\D/g, '');
      return bd.endsWith(digits.slice(-8)) || digits.endsWith(bd.slice(-8));
    }
    return false;
  });
  return { bookings: matches };
}

export async function rescheduleBooking(code, payload) {
  if (!useLocalMode) {
    return serverFetch(`/api/bookings/${encodeURIComponent(code)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
  const store = loadLocalStore();
  const bk = store.bookings.find((b) => b.code.toUpperCase() === code.toUpperCase());
  if (!bk) throw new Error('Reserva no encontrada.');
  const maxMods = Number(store.settings.maxModifications || 4);
  if ((bk.modificationsCount || 0) >= maxMods) {
    throw new Error(`Alcanzaste el límite de ${maxMods} modificaciones.`);
  }
  const barber = store.barbers.find((b) => b.id === (payload.barberId || bk.barberId)) || store.barbers[0];
  bk.date = payload.date;
  bk.time = payload.time;
  bk.barberId = barber.id;
  bk.barberName = barber.name;
  bk.modificationsCount = (bk.modificationsCount || 0) + 1;
  saveLocalStore(store);
  return { booking: bk };
}

export async function cancelBooking(code) {
  if (!useLocalMode) {
    return serverFetch(`/api/bookings/${encodeURIComponent(code)}/cancel`, { method: 'POST' });
  }
  const store = loadLocalStore();
  const bk = store.bookings.find((b) => b.code.toUpperCase() === code.toUpperCase());
  if (!bk) throw new Error('Reserva no encontrada.');
  bk.status = 'cancelled';
  saveLocalStore(store);
  return { booking: bk };
}

// ==========================================
// ENDPOINTS ADMINISTRADOR (/admin.html)
// ==========================================
export async function adminLogin(pin) {
  if (!useLocalMode) {
    try {
      const data = await serverFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      setAdminToken(data.token);
      return data;
    } catch (err) {
      if (!err.status) {
        useLocalMode = true;
      } else {
        throw err;
      }
    }
  }
  const store = loadLocalStore();
  if (String(pin).trim() !== String(store.settings.adminPin || '2026')) {
    throw new Error('PIN incorrecto.');
  }
  setAdminToken('local-demo-token');
  return { token: 'local-demo-token' };
}

export async function getAdminState() {
  if (!useLocalMode) {
    try {
      return await serverFetch('/api/admin/state');
    } catch (err) {
      if (!err.status) {
        useLocalMode = true;
      } else {
        throw err;
      }
    }
  }
  const store = loadLocalStore();
  return {
    ...store,
    googlePlacesConfigured: false,
    serverTime: getBuenosAiresNow(),
  };
}

export async function adminCreateBooking(payload) {
  if (!useLocalMode) {
    return serverFetch('/api/admin/bookings', { method: 'POST', body: JSON.stringify(payload) });
  }
  const store = loadLocalStore();
  return { booking: localCreateBooking(store, payload, true) };
}

export async function adminUpdateBooking(id, patch) {
  if (!useLocalMode) {
    return serverFetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }
  const store = loadLocalStore();
  const bk = store.bookings.find((b) => b.id === id);
  if (!bk) throw new Error('Turno no encontrado.');
  Object.assign(bk, patch);
  saveLocalStore(store);
  return { booking: bk };
}

export async function adminDeleteBooking(id) {
  if (!useLocalMode) {
    return serverFetch(`/api/admin/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  const store = loadLocalStore();
  store.bookings = store.bookings.filter((b) => b.id !== id);
  saveLocalStore(store);
  return { ok: true };
}

export async function adminCreateService(payload) {
  if (!useLocalMode) {
    return serverFetch('/api/admin/services', { method: 'POST', body: JSON.stringify(payload) });
  }
  const store = loadLocalStore();
  const srv = {
    id: `srv-${Date.now()}`,
    ...payload,
    active: true,
    order: store.services.length + 1,
    includes: payload.includes || [],
    image: payload.image || 'assets/work-fade-1.png',
  };
  store.services.push(srv);
  saveLocalStore(store);
  return { service: srv };
}

export async function adminUpdateService(id, patch) {
  if (!useLocalMode) {
    return serverFetch(`/api/admin/services/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }
  const store = loadLocalStore();
  const srv = store.services.find((s) => s.id === id);
  if (srv) Object.assign(srv, patch);
  saveLocalStore(store);
  return { service: srv };
}

export async function adminDeleteService(id) {
  if (!useLocalMode) {
    return serverFetch(`/api/admin/services/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  const store = loadLocalStore();
  store.services = store.services.filter((s) => s.id !== id);
  saveLocalStore(store);
  return { ok: true };
}

export async function adminCreateBarber(payload) {
  if (!useLocalMode) {
    return serverFetch('/api/admin/barbers', { method: 'POST', body: JSON.stringify(payload) });
  }
  const store = loadLocalStore();
  const b = { id: `barber-${Date.now()}`, rating: 5.0, reviewCount: 0, active: true, ...payload };
  store.barbers.push(b);
  saveLocalStore(store);
  return { barber: b };
}

export async function adminUpdateBarber(id, patch) {
  if (!useLocalMode) {
    return serverFetch(`/api/admin/barbers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }
  const store = loadLocalStore();
  const b = store.barbers.find((x) => x.id === id);
  if (b) Object.assign(b, patch);
  saveLocalStore(store);
  return { barber: b };
}

export async function adminCreateBlock(payload) {
  if (!useLocalMode) {
    return serverFetch('/api/admin/blocks', { method: 'POST', body: JSON.stringify(payload) });
  }
  const store = loadLocalStore();
  const blk = { id: `blk-${Date.now()}`, ...payload };
  store.blocks.push(blk);
  saveLocalStore(store);
  return { block: blk };
}

export async function adminDeleteBlock(id) {
  if (!useLocalMode) {
    return serverFetch(`/api/admin/blocks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  const store = loadLocalStore();
  store.blocks = store.blocks.filter((b) => b.id !== id);
  saveLocalStore(store);
  return { ok: true };
}

export async function adminCreateReview(payload) {
  if (!useLocalMode) {
    return serverFetch('/api/admin/reviews', { method: 'POST', body: JSON.stringify(payload) });
  }
  const store = loadLocalStore();
  const rev = { id: `rev-${Date.now()}`, featured: true, date: getBuenosAiresNow().dateStr, ...payload };
  store.reviews.unshift(rev);
  saveLocalStore(store);
  return { review: rev };
}

export async function adminUpdateReview(id, patch) {
  if (!useLocalMode) {
    return serverFetch(`/api/admin/reviews/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }
  const store = loadLocalStore();
  const r = store.reviews.find((x) => x.id === id);
  if (r) Object.assign(r, patch);
  saveLocalStore(store);
  return { review: r };
}

export async function adminDeleteReview(id) {
  if (!useLocalMode) {
    return serverFetch(`/api/admin/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  const store = loadLocalStore();
  store.reviews = store.reviews.filter((x) => x.id !== id);
  saveLocalStore(store);
  return { ok: true };
}

export async function adminUpdateSettings(patch) {
  if (!useLocalMode) {
    return serverFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  }
  const store = loadLocalStore();
  if (patch.newAdminPin) store.settings.adminPin = patch.newAdminPin;
  Object.assign(store.settings, patch);
  saveLocalStore(store);
  return { settings: store.settings };
}

export async function adminSyncGoogleReviews() {
  if (!useLocalMode) {
    return serverFetch('/api/admin/google-reviews/sync', { method: 'POST' });
  }
  throw new Error(
    'La sincronización automática con Google Places API requiere el servidor Node.js activo y GOOGLE_PLACES_API_KEY en .env.'
  );
}

export async function adminImportBackup(data) {
  if (!useLocalMode) {
    return serverFetch('/api/admin/import', { method: 'POST', body: JSON.stringify(data) });
  }
  saveLocalStore(data);
  return { ok: true };
}

export async function adminResetDemo() {
  if (!useLocalMode) {
    return serverFetch('/api/admin/reset-demo', { method: 'POST' });
  }
  saveLocalStore(createClientSeed());
  return { ok: true };
}
