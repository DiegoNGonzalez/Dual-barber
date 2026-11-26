import { addDays, calcCashPrice, getBuenosAiresNow, getDayOfWeek } from './utils.js';

/**
 * Motor local de respaldo (localStorage) con exactamente la misma lógica
 * que el servidor Node.js, para que la demo funcione 100% incluso si se abre
 * en hosting estático (GitHub Pages / Netlify) sin backend activo.
 */

const STORAGE_KEY = 'dual_barber_store_v1';

function getNextOpenDates(count = 4) {
  const today = getBuenosAiresNow().dateStr;
  const dates = [];
  let offset = 0;
  while (dates.length < count && offset < 21) {
    const dt = addDays(today, offset);
    const dow = getDayOfWeek(dt);
    if (dow >= 2 && dow <= 6) dates.push(dt);
    offset++;
  }
  return dates;
}

export function createClientSeed() {
  const openDates = getNextOpenDates(4);
  const d0 = openDates[0] || getBuenosAiresNow().dateStr;
  const d1 = openDates[1] || addDays(d0, 1);
  const d2 = openDates[2] || addDays(d0, 2);

  return {
    version: 2,
    settings: {
      brandName: 'Dual Barber',
      tagline: 'Tu estilo, nuestra prioridad.',
      heroHeadline: 'Precisión en cada corte. Experiencia en cada visita.',
      aboutText:
        'En DUAL BARBER buscamos que cada visita sea una experiencia. Disfrutá de un servicio personalizado, atención de calidad y un espacio pensado para que te sientas cómodo desde que entrás hasta que salís. Te ves bien, te sentís mejor.',
      address: 'Av. Olazábal 4235',
      addressReference: 'Entre Mariano Acha y Donado · Villa Urquiza, CABA',
      postalCode: 'C1430BQI',
      city: 'Buenos Aires, Argentina',
      whatsappPrimary: '5491178235895',
      whatsappPrimaryDisplay: '+54 11 7823-5895',
      whatsappSecondary: '5491122969897',
      whatsappSecondaryDisplay: '+54 11 2296-9897',
      instagramHandle: '@dual.barberia',
      instagramUrl: 'https://www.instagram.com/dual.barberia/',
      googleMapsUrl: 'https://maps.app.goo.gl/bdrQ5wWH8kNAD1Nz5?g_st=ic',
      googleMapsEmbedQuery: 'Dual Barber - Barberia, Av. Olazábal 4235, C1430BQI Buenos Aires',
      googleRating: 5.0,
      googleReviewCount: 81,
      googleLastSync: getBuenosAiresNow().dateStr,
      googlePlaceId: '',
      cashDiscountPercent: 10,
      minNoticeMinutes: 60,
      cancelNoticeMinutes: 60,
      maxModifications: 4,
      slotIntervalMinutes: 30,
      bookingHorizonDays: 21,
      adminPin: '2026',
      hours: {
        0: { label: 'Domingo', open: false, start: '11:00', end: '20:00' },
        1: { label: 'Lunes', open: false, start: '11:00', end: '20:00' },
        2: { label: 'Martes', open: true, start: '11:00', end: '20:00' },
        3: { label: 'Miércoles', open: true, start: '11:00', end: '20:00' },
        4: { label: 'Jueves', open: true, start: '11:00', end: '20:00' },
        5: { label: 'Viernes', open: true, start: '11:00', end: '20:00' },
        6: { label: 'Sábado', open: true, start: '11:00', end: '20:00' },
      },
    },
    services: [
      {
        id: 'srv-corte',
        name: 'Corte de Cabello',
        durationMinutes: 30,
        price: 18000,
        cashDiscountEligible: true,
        badge: 'Más elegido',
        description:
          'Servicio completo de corte de pelo personalizado a tu estilo, degradado limpio y terminación a navaja.',
        includes: ['Asesoramiento de estilo', 'Corte a tijera y máquina', 'Terminación y peinado'],
        image: 'assets/work-fade-1.png',
        active: true,
        order: 1,
      },
      {
        id: 'srv-corte-barba',
        name: 'Corte y Barba',
        durationMinutes: 30,
        price: 21000,
        cashDiscountEligible: true,
        badge: 'Combo completo',
        description:
          'Servicio completo de corte de pelo a tu estilo combinado con perfilado y definición de barba bien prolijo.',
        includes: ['Corte de cabello completo', 'Perfilado y rebaje de barba', 'Definición de líneas'],
        image: 'assets/work-fade-2.png',
        active: true,
        order: 2,
      },
      {
        id: 'srv-barba',
        name: 'Barba',
        durationMinutes: 15,
        price: 14000,
        cashDiscountEligible: true,
        badge: 'Express',
        description:
          'Servicio completo de mantenimiento, rebaje simétrico y perfilado de barba bien prolijo.',
        includes: ['Diseño según tu rostro', 'Perfilado de mejillas y cuello', 'Terminación prolija'],
        image: 'assets/beard-detail.jpg',
        active: true,
        order: 3,
      },
    ],
    barbers: [
      {
        id: 'barber-agustin',
        name: 'Agustín Placente',
        nickname: 'Agus',
        role: 'Co-fundador & Master Barber',
        specialty: 'Fades precisos, cortes clásicos y asesoramiento personalizado.',
        rating: 5.0,
        reviewCount: 42,
        workDays: [2, 3, 4, 5, 6],
        startTime: '11:00',
        endTime: '20:00',
        photo: 'assets/barber-agustin.jpg',
        active: true,
      },
      {
        id: 'barber-luciano',
        name: 'Luciano Bersaggi',
        nickname: 'Lucho',
        role: 'Co-fundador & Master Barber',
        specialty: 'Degradados modernos, texturas urbanas y perfilado de barba.',
        rating: 5.0,
        reviewCount: 39,
        workDays: [2, 3, 4, 5, 6],
        startTime: '11:00',
        endTime: '20:00',
        photo: 'assets/barber-luciano.jpg',
        active: true,
      },
    ],
    reviews: [
      {
        id: 'rev-1',
        author: 'Facundo M.',
        rating: 5,
        source: 'Google Maps',
        service: 'Corte y Barba',
        date: '2026-10-12',
        text: 'Agus y Lucho son unos fenómenos. Los conozco desde la barbería anterior y los seguiré a donde vayan porque son muy buenos en su trabajo y sobre todo buena gente. ¡Recomiendo siempre!',
        featured: true,
      },
      {
        id: 'rev-2',
        author: 'Rubén G.',
        rating: 5,
        source: 'Google Maps',
        service: 'Corte y Barba',
        date: '2026-10-19',
        text: 'La verdad, son unos genios. Ambos te brindan el mismo nivel de servicio, charlan de lo que sea y lo mejor es que te asesoran con todo. ¡Gracias Agus y Lucho!',
        featured: true,
      },
      {
        id: 'rev-3',
        author: 'Adrián S.',
        rating: 5,
        source: 'Google Maps',
        service: 'Corte de Cabello',
        date: '2026-11-11',
        text: 'Excelente los chicos, el trato, la dedicación y el profesionalismo, altamente destacables. ¡Súper recomendables!',
        featured: true,
      },
      {
        id: 'rev-4',
        author: 'Dante R.',
        rating: 5,
        source: 'Google Maps',
        service: 'Corte de Cabello',
        date: '2026-11-14',
        text: 'Muy buen corte de pelo, muy buena onda los chicos y la música de 10.',
        featured: true,
      },
      {
        id: 'rev-5',
        author: 'Martín C.',
        rating: 5,
        source: 'Google Maps',
        service: 'Corte de Cabello',
        date: '2026-11-05',
        text: '¡Excelente! Unos genios Agus y Lucho, 100% recomendables.',
        featured: true,
      },
      {
        id: 'rev-6',
        author: 'Tiziano P.',
        rating: 5,
        source: 'Google Maps',
        service: 'Corte de Cabello',
        date: '2026-11-14',
        text: '¡Unos genios! Excelente atención y trato desde que entrás hasta que salís.',
        featured: true,
      },
    ],
    blocks: [
      {
        id: 'blk-demo-1',
        barberId: 'barber-agustin',
        date: d1,
        startTime: '14:00',
        endTime: '14:30',
        reason: 'Almuerzo',
      },
    ],
    bookings: [
      {
        id: 'bk-101',
        code: 'DUAL-4821',
        serviceId: 'srv-corte-barba',
        serviceName: 'Corte y Barba',
        durationMinutes: 30,
        price: 21000,
        cashPrice: 18900,
        barberId: 'barber-agustin',
        barberName: 'Agustín Placente',
        date: d0,
        time: '11:30',
        clientName: 'Tomás Ferreyra',
        clientPhone: '1165428910',
        clientEmail: 'tomas.f@gmail.com',
        notes: 'Mid fade natural y perfilado de barba',
        status: 'completed',
        paymentMethod: 'efectivo',
        finalAmount: 18900,
        modificationsCount: 0,
        source: 'web',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 'bk-103',
        code: 'DUAL-6342',
        serviceId: 'srv-corte-barba',
        serviceName: 'Corte y Barba',
        durationMinutes: 30,
        price: 21000,
        cashPrice: 18900,
        barberId: 'barber-agustin',
        barberName: 'Agustín Placente',
        date: d0,
        time: '15:30',
        clientName: 'Santiago Morales',
        clientPhone: '1149087712',
        clientEmail: 'santi.morales@hotmail.com',
        notes: '',
        status: 'confirmed',
        paymentMethod: null,
        finalAmount: null,
        modificationsCount: 0,
        source: 'web',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'bk-105',
        code: 'DUAL-8045',
        serviceId: 'srv-corte',
        serviceName: 'Corte de Cabello',
        durationMinutes: 30,
        price: 18000,
        cashPrice: 16200,
        barberId: 'barber-luciano',
        barberName: 'Luciano Bersaggi',
        date: d1,
        time: '12:30',
        clientName: 'Federico Benítez',
        clientPhone: '1160214488',
        clientEmail: 'fede.benitez@gmail.com',
        notes: '',
        status: 'confirmed',
        paymentMethod: null,
        finalAmount: null,
        modificationsCount: 0,
        source: 'web',
        createdAt: new Date(Date.now() - 21600000).toISOString(),
      },
      {
        id: 'bk-106',
        code: 'DUAL-9104',
        serviceId: 'srv-corte-barba',
        serviceName: 'Corte y Barba',
        durationMinutes: 30,
        price: 21000,
        cashPrice: 18900,
        barberId: 'barber-agustin',
        barberName: 'Agustín Placente',
        date: d2,
        time: '17:00',
        clientName: 'Lucas Giménez',
        clientPhone: '1152346677',
        clientEmail: 'lucas.gimenez@gmail.com',
        notes: '',
        status: 'confirmed',
        paymentMethod: null,
        finalAmount: null,
        modificationsCount: 0,
        source: 'manual',
        createdAt: new Date(Date.now() - 10800000).toISOString(),
      },
    ],
  };
}

export function loadLocalStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if ((parsed.version || 1) < 2) {
        if (parsed.settings && parsed.settings.slotIntervalMinutes === 15) {
          parsed.settings.slotIntervalMinutes = 30;
        }
        parsed.version = 2;
        saveLocalStore(parsed);
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  const seed = createClientSeed();
  saveLocalStore(seed);
  return seed;
}

export function saveLocalStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function parseTime(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function fmtTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function localComputeOpenStatus(settings) {
  const now = getBuenosAiresNow();
  const h = settings.hours[String(now.dow)];
  if (h && h.open) {
    const start = parseTime(h.start);
    const end = parseTime(h.end);
    if (now.minutesNow >= start && now.minutesNow < end) {
      return { isOpen: true, label: `Abierto ahora · Hasta las ${h.end} hs` };
    }
    if (now.minutesNow < start) {
      return { isOpen: false, label: `Hoy abrimos a las ${h.start} hs` };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const next = settings.hours[String((now.dow + i) % 7)];
    if (next && next.open) {
      return {
        isOpen: false,
        label: `Cerrado · Abrimos ${i === 1 ? 'Mañana' : next.label} ${next.start} hs`,
      };
    }
  }
  return { isOpen: false, label: 'Cerrado temporalmente' };
}

export function localIsBarberFree(store, barber, date, startMin, duration, excludeId = null) {
  const endMin = startMin + duration;
  const dow = getDayOfWeek(date);
  const day = store.settings.hours[String(dow)];
  if (!day || !day.open || !barber.active || !barber.workDays.includes(dow)) return false;

  const open = Math.max(parseTime(day.start), parseTime(barber.startTime));
  const close = Math.min(parseTime(day.end), parseTime(barber.endTime));
  if (startMin < open || endMin > close) return false;

  for (const blk of store.blocks) {
    if (blk.date !== date) continue;
    if (blk.barberId !== 'all' && blk.barberId !== barber.id) continue;
    if (startMin < parseTime(blk.endTime) && endMin > parseTime(blk.startTime)) return false;
  }

  for (const bk of store.bookings) {
    if (bk.id === excludeId || bk.date !== date || bk.barberId !== barber.id) continue;
    if (bk.status === 'cancelled' || bk.status === 'no_show') continue;
    const bs = parseTime(bk.time);
    const be = bs + Number(bk.durationMinutes || 30);
    if (startMin < be && endMin > bs) return false;
  }
  return true;
}

export function localGetAvailability(store, { date, serviceId, barberId = 'any', excludeBookingId = null, bypassNotice = false }) {
  const service = store.services.find((s) => s.id === serviceId && s.active);
  if (!service) return { date, closed: false, slots: [], reason: 'Servicio no disponible.' };
  const dow = getDayOfWeek(date);
  const day = store.settings.hours[String(dow)];
  if (!day || !day.open) {
    return {
      date,
      closed: true,
      reason: `Los ${day ? day.label.toLowerCase() + 's' : 'días seleccionados'} permanecemos cerrados.`,
      slots: [],
    };
  }
  const activeBarbers = store.barbers.filter((b) => b.active);
  const candidates = barberId === 'any' ? activeBarbers : activeBarbers.filter((b) => b.id === barberId);
  const now = getBuenosAiresNow();
  const minNotice = bypassNotice ? 0 : Number(store.settings.minNoticeMinutes || 60);
  const interval = Math.max(15, Number(store.settings.slotIntervalMinutes || 30));
  const duration = Number(service.durationMinutes || 30);

  const slots = [];
  for (let min = parseTime(day.start); min + duration <= parseTime(day.end); min += interval) {
    if (!bypassNotice && date === now.dateStr && min < now.minutesNow + minNotice) continue;
    const free = candidates.filter((b) => localIsBarberFree(store, b, date, min, duration, excludeBookingId));
    if (free.length > 0) {
      slots.push({ time: fmtTime(min), availableBarberIds: free.map((b) => b.id) });
    }
  }
  return { date, closed: false, dayLabel: day.label, hours: `${day.start} - ${day.end}`, slots };
}

export function localCreateBooking(store, payload, isManual = false) {
  const service = store.services.find((s) => s.id === payload.serviceId);
  if (!service) throw new Error('Servicio inválido.');
  const avail = localGetAvailability(store, {
    date: payload.date,
    serviceId: payload.serviceId,
    barberId: payload.barberId || 'any',
    bypassNotice: isManual,
  });
  const match = (avail.slots || []).find((s) => s.time === payload.time);
  if (!match) throw new Error('Horario no disponible.');

  const barberId = match.availableBarberIds[0];
  const barber = store.barbers.find((b) => b.id === barberId);
  const booking = {
    id: `bk-${Date.now()}`,
    code: `DUAL-${Math.floor(1000 + Math.random() * 9000)}`,
    serviceId: service.id,
    serviceName: service.name,
    durationMinutes: Number(service.durationMinutes),
    price: Number(service.price),
    cashPrice: calcCashPrice(service.price, store.settings.cashDiscountPercent, service.cashDiscountEligible),
    barberId: barber.id,
    barberName: barber.name,
    date: payload.date,
    time: payload.time,
    clientName: payload.clientName.trim(),
    clientPhone: (payload.clientPhone || '').trim(),
    clientEmail: (payload.clientEmail || '').trim(),
    notes: (payload.notes || '').trim(),
    status: 'confirmed',
    paymentMethod: null,
    finalAmount: null,
    modificationsCount: 0,
    source: isManual ? 'manual' : 'web',
    createdAt: new Date().toISOString(),
  };
  store.bookings.push(booking);
  saveLocalStore(store);
  return booking;
}
