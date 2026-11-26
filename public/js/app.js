import {
  cancelBooking,
  createBooking,
  getAvailability,
  getPublicBootstrap,
  lookupBookings,
  rescheduleBooking,
} from './api.js';
import {
  GOOGLE_G_SVG,
  addDays,
  buildGoogleCalendarUrl,
  buildWhatsAppUrl,
  calcCashPrice,
  downloadICS,
  esc,
  formatARS,
  formatDateLong,
  formatDateShort,
  getBuenosAiresNow,
  getDateChipParts,
  showToast,
  statusLabel,
} from './utils.js';

const state = {
  settings: null,
  services: [],
  barbers: [],
  reviews: [],
  openStatus: null,
  step: 1,
  selectedServiceId: null,
  selectedBarberId: 'any',
  selectedDate: null,
  selectedTime: null,
  availability: null,
  loadingSlots: false,
  confirmedBooking: null,
  reschedulingCode: null,
  rescheduleDate: null,
  rescheduleTime: null,
  rescheduleSlots: [],
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function init() {
  setupHeaderAndMenu();
  setupMyBookingsModal();

  try {
    const data = await getPublicBootstrap();
    state.settings = data.settings;
    state.services = data.services || [];
    state.barbers = data.barbers || [];
    state.reviews = data.reviews || [];
    state.openStatus = data.openStatus;

    if (state.services.length > 0) {
      state.selectedServiceId = state.services[0].id;
    }

    // Elegir primer día abierto disponible
    state.selectedDate = findFirstOpenDate();

    renderHeroAndBrand();
    renderServices();
    renderTeam();
    renderGoogleReviews();
    renderLocationAndHours();
    renderBookingStep();
    updateSummary();
  } catch (err) {
    console.error(err);
    showToast('No pudimos cargar los datos de la barbería. Intentá recargar.', 'error');
  }
}

function findFirstOpenDate() {
  const today = getBuenosAiresNow().dateStr;
  const horizon = Number(state.settings?.bookingHorizonDays || 21);
  for (let i = 0; i < horizon; i++) {
    const dt = addDays(today, i);
    const { dow } = getDateChipParts(dt);
    const dayCfg = state.settings?.hours?.[String(dow)];
    if (dayCfg && dayCfg.open) return dt;
  }
  return today;
}

// ==========================================
// HEADER & MENÚ MÓVIL
// ==========================================
function setupHeaderAndMenu() {
  const header = document.getElementById('site-header');
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggleBtn = document.getElementById('btn-mobile-menu');
  const mobileMenu = document.getElementById('mobile-menu');
  const closeMobile = () => {
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');
  };

  toggleBtn.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('is-open');
    mobileMenu.setAttribute('aria-hidden', String(!open));
    toggleBtn.setAttribute('aria-expanded', String(open));
  });

  mobileMenu.querySelectorAll('.mobile-nav-link').forEach((link) => {
    link.addEventListener('click', closeMobile);
  });

  document.getElementById('btn-mobile-my-bookings').addEventListener('click', () => {
    closeMobile();
    openMyBookingsModal();
  });

  // Navegación entre pasos de reserva
  document.querySelectorAll('.step-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (state.confirmedBooking) return;
      const target = Number(tab.dataset.step);
      if (target === 2 && !state.selectedServiceId) return;
      if (target === 3 && !state.selectedServiceId) return;
      if (target === 4 && (!state.selectedDate || !state.selectedTime)) return;
      goToStep(target);
    });
  });
}

// ==========================================
// RENDER: HERO, SERVICIOS, EQUIPO, GOOGLE REVIEWS, UBICACIÓN
// ==========================================
function renderHeroAndBrand() {
  const s = state.settings;
  document.getElementById('hero-eyebrow').textContent = `Villa Urquiza · ${s.address}`;
  document.getElementById('hero-subtitle').textContent = s.aboutText;
  document.getElementById('about-copy').textContent = s.aboutText;
  document.getElementById('hero-address-stat').textContent = `${s.address}, CABA`;
  document.getElementById('hero-discount-stat').textContent = `${s.cashDiscountPercent}% OFF abonando en efectivo`;

  const ratingStr = Number(s.googleRating || 5.0).toFixed(1);
  document.getElementById('hero-google-stat').innerHTML = `
    <span class="star-inline">★★★★★</span>
    <span class="tabular-nums">${esc(ratingStr)} (${esc(s.googleReviewCount)} reseñas)</span>
  `;

  if (state.openStatus) {
    const dotCls = state.openStatus.isOpen ? 'status-dot' : 'status-dot status-dot--closed';
    document.getElementById('hero-open-status').innerHTML = `
      <span class="${dotCls}"></span>
      <span>${esc(state.openStatus.label)}</span>
    `;
  }

  document.getElementById('cash-banner').innerHTML = `
    <div><strong>${esc(s.cashDiscountPercent)}% de descuento en efectivo</strong> en todos nuestros servicios abonando en el local.</div>
    <div>Turnos con ${esc(s.minNoticeMinutes)} min de anticipación · Hasta ${esc(s.maxModifications)} modificaciones sin cargo.</div>
  `;

  document.getElementById('sum-cash-label').textContent = `En efectivo (${s.cashDiscountPercent}% OFF)`;
  document.getElementById('sum-policy').textContent = `Solo turnos con ${s.minNoticeMinutes} min de anticipación. Podés modificar tu reserva hasta ${s.maxModifications} veces o cancelarla sin drama hasta ${s.cancelNoticeMinutes} min antes desde “Mis turnos”.`;

  const igLink = document.getElementById('gallery-ig-link');
  igLink.href = s.instagramUrl;
  igLink.textContent = `Seguir en ${s.instagramHandle}`;
  document.getElementById('footer-ig-link').href = s.instagramUrl;
}

function renderServices() {
  const grid = document.getElementById('services-grid');
  const discount = Number(state.settings.cashDiscountPercent || 10);

  grid.innerHTML = state.services
    .map((srv) => {
      const cash = calcCashPrice(srv.price, discount, srv.cashDiscountEligible);
      const includesHtml =
        Array.isArray(srv.includes) && srv.includes.length > 0
          ? `<ul class="service-card__list">${srv.includes
              .map((item) => `<li>${esc(item)}</li>`)
              .join('')}</ul>`
          : '';

      return `
        <article class="service-card">
          <div class="service-card__media">
            <img src="${esc(srv.image || 'assets/work-fade-1.png')}" alt="${esc(srv.name)} en Dual Barber" loading="lazy" />
            <span class="service-card__duration tabular-nums">${esc(srv.durationMinutes)} min</span>
            ${srv.badge ? `<span class="service-card__badge">${esc(srv.badge)}</span>` : ''}
          </div>
          <div class="service-card__body">
            <h3 class="service-card__title">${esc(srv.name)}</h3>
            <p class="service-card__desc">${esc(srv.description)}</p>
            ${includesHtml}
            <div class="service-card__pricing">
              <div>
                <div class="price-main tabular-nums">${formatARS(srv.price)}</div>
                ${
                  srv.cashDiscountEligible
                    ? `<div class="price-cash tabular-nums">${formatARS(cash)} en efectivo (${discount}% OFF)</div>`
                    : ''
                }
              </div>
            </div>
            <div class="service-card__cta">
              <button
                type="button"
                class="btn btn--dark btn--block"
                data-pick-service="${esc(srv.id)}"
              >
                Agendar ${esc(srv.name)}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('[data-pick-service]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.confirmedBooking = null;
      state.selectedServiceId = btn.dataset.pickService;
      state.selectedTime = null;
      goToStep(2);
      document.getElementById('turnos').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function renderTeam() {
  const grid = document.getElementById('team-grid');
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  grid.innerHTML = state.barbers
    .map((b) => {
      const daysText = (b.workDays || []).map((d) => dayNames[d]).join(', ');
      return `
        <article class="barber-card">
          <div class="barber-card__photo">
            <img src="${esc(b.photo || 'assets/barber-agustin.jpg')}" alt="${esc(b.name)} — Barbero en Dual Barber" loading="lazy" />
          </div>
          <div class="barber-card__body">
            <span class="barber-card__role">${esc(b.role)}</span>
            <h3 class="barber-card__name">${esc(b.name)}</h3>
            <p class="barber-card__spec">${esc(b.specialty)}</p>
            <div class="barber-card__meta">
              <span><strong style="color: var(--accent)">★ ${Number(b.rating || 5).toFixed(1)}</strong> · Atención personalizada</span>
              <span>Atiende: ${esc(daysText)} · ${esc(b.startTime)} a ${esc(b.endTime)} hs</span>
            </div>
            <div class="barber-card__action">
              <button type="button" class="btn btn--outline-light btn--sm" data-pick-barber="${esc(b.id)}">
                Reservar con ${esc(b.nickname || b.name.split(' ')[0])} →
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('[data-pick-barber]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.confirmedBooking = null;
      state.selectedBarberId = btn.dataset.pickBarber;
      state.selectedTime = null;
      goToStep(3);
      document.getElementById('turnos').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function renderGoogleReviews() {
  const s = state.settings;
  document.getElementById('google-rating-num').textContent = Number(s.googleRating || 5).toFixed(1);
  document.getElementById('google-badge-line').innerHTML = `${GOOGLE_G_SVG} <span>Google Maps · Perfil verificado</span>`;
  document.getElementById('google-review-count').textContent = `Basado en ${s.googleReviewCount} reseñas en Google`;

  document.getElementById('btn-google-maps-reviews').href = s.googleMapsUrl;
  document.getElementById('btn-google-write-review').href = s.googleMapsUrl;

  const featured = state.reviews.filter((r) => r.featured);
  const visible = featured.length > 0 ? featured : state.reviews.slice(0, 6);

  document.getElementById('reviews-grid').innerHTML = visible
    .map(
      (rev) => `
      <article class="review-card">
        <div class="review-card__top">
          <div class="review-card__stars" aria-label="${rev.rating} estrellas">${'★'.repeat(
        Math.round(rev.rating || 5)
      )}</div>
          <span class="review-card__source">${GOOGLE_G_SVG} ${esc(rev.source || 'Google Maps')}</span>
        </div>
        <p class="review-card__text">“${esc(rev.text)}”</p>
        <footer class="review-card__footer">
          <span class="review-card__author">${esc(rev.author)}</span>
          <span class="review-card__service">${esc(rev.service || 'Cliente verificado')}</span>
        </footer>
      </article>
    `
    )
    .join('');
}

function renderLocationAndHours() {
  const s = state.settings;
  document.getElementById('loc-address').textContent = s.address;
  document.getElementById('loc-reference').textContent = s.addressReference;
  document.getElementById('map-directions-link').href = s.googleMapsUrl;

  const todayDow = getBuenosAiresNow().dow;
  const order = [1, 2, 3, 4, 5, 6, 0]; // Lunes a Domingo
  document.getElementById('hours-table').innerHTML = order
    .map((dow) => {
      const h = s.hours[String(dow)];
      const isToday = dow === todayDow;
      const cls = [
        'hours-row',
        isToday ? 'is-today' : '',
        !h.open ? 'hours-row--closed' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <div class="${cls}">
          <span>${esc(h.label)}</span>
          <span class="tabular-nums">${h.open ? `${esc(h.start)} — ${esc(h.end)} hs` : 'Cerrado'}</span>
        </div>
      `;
    })
    .join('');

  const waMsg = 'Hola Dual Barber! Quería hacer una consulta sobre turnos.';
  const wa1 = buildWhatsAppUrl(s.whatsappPrimary, waMsg);
  const wa2 = s.whatsappSecondary ? buildWhatsAppUrl(s.whatsappSecondary, waMsg) : '';

  document.getElementById('contact-actions').innerHTML = `
    <a href="${esc(wa1)}" target="_blank" rel="noopener noreferrer" class="btn btn--accent btn--sm">
      WhatsApp · ${esc(s.whatsappPrimaryDisplay)}
    </a>
    ${
      wa2
        ? `<a href="${esc(wa2)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-light btn--sm">
            WhatsApp 2 · ${esc(s.whatsappSecondaryDisplay)}
          </a>`
        : ''
    }
    <a href="${esc(s.instagramUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-light btn--sm">
      Instagram ${esc(s.instagramHandle)}
    </a>
  `;
}

// ==========================================
// MOTOR DE RESERVAS (4 PASOS + RECIBO)
// ==========================================
function goToStep(stepNum) {
  state.step = stepNum;
  updateStepTabs();
  renderBookingStep();
  updateSummary();
  if (stepNum === 3) {
    loadSlotsForSelectedDate();
  }
}

function updateStepTabs() {
  document.querySelectorAll('.step-tab').forEach((tab) => {
    const n = Number(tab.dataset.step);
    tab.classList.toggle('is-active', !state.confirmedBooking && n === state.step);
    tab.classList.toggle('is-done', Boolean(state.confirmedBooking) || n < state.step);
  });
}

function getSelectedService() {
  return state.services.find((s) => s.id === state.selectedServiceId) || null;
}

function getSelectedBarber() {
  if (state.selectedBarberId === 'any') return null;
  return state.barbers.find((b) => b.id === state.selectedBarberId) || null;
}

function updateSummary() {
  const srv = getSelectedService();
  const barber = getSelectedBarber();
  const discount = Number(state.settings?.cashDiscountPercent || 10);

  document.getElementById('sum-service').textContent = srv ? srv.name : 'Sin elegir';
  document.getElementById('sum-duration').textContent = srv ? `${srv.durationMinutes} min` : '—';
  document.getElementById('sum-barber').textContent =
    state.selectedBarberId === 'any'
      ? 'Primer barbero disponible'
      : barber
      ? barber.name
      : 'Sin elegir';
  document.getElementById('sum-date').textContent = state.selectedDate
    ? formatDateShort(state.selectedDate)
    : 'Sin elegir';
  document.getElementById('sum-time').textContent = state.selectedTime
    ? `${state.selectedTime} hs`
    : 'Sin elegir';

  if (srv) {
    const cash = calcCashPrice(srv.price, discount, srv.cashDiscountEligible);
    document.getElementById('sum-price').textContent = formatARS(srv.price);
    document.getElementById('sum-cash-price').textContent = srv.cashDiscountEligible
      ? formatARS(cash)
      : formatARS(srv.price);
  } else {
    document.getElementById('sum-price').textContent = '—';
    document.getElementById('sum-cash-price').textContent = '—';
  }
}

function renderBookingStep() {
  const body = document.getElementById('booking-step-body');
  if (state.confirmedBooking) {
    renderReceipt(body);
    return;
  }

  if (state.step === 1) renderStep1Service(body);
  else if (state.step === 2) renderStep2Barber(body);
  else if (state.step === 3) renderStep3DateTime(body);
  else if (state.step === 4) renderStep4ClientForm(body);
}

function renderStep1Service(container) {
  const discount = Number(state.settings.cashDiscountPercent || 10);
  container.innerHTML = `
    <h3 class="step-heading">1. Elegí tu servicio</h3>
    <p class="step-sub">Todos los servicios incluyen terminación prolija y ${discount}% de descuento pagando en efectivo.</p>
    <div class="option-list">
      ${state.services
        .map((srv) => {
          const selected = srv.id === state.selectedServiceId;
          const cash = calcCashPrice(srv.price, discount, srv.cashDiscountEligible);
          return `
            <button type="button" class="option-card ${selected ? 'is-selected' : ''}" data-srv-id="${esc(
            srv.id
          )}">
              <div>
                <div class="option-card__title">${esc(srv.name)}</div>
                <div class="option-card__meta">${esc(srv.durationMinutes)} min · ${esc(srv.description)}</div>
              </div>
              <div class="option-card__right">
                <div class="option-card__price tabular-nums">${formatARS(srv.price)}</div>
                ${
                  srv.cashDiscountEligible
                    ? `<div class="option-card__cash tabular-nums">${formatARS(cash)} efectivo</div>`
                    : ''
                }
              </div>
            </button>
          `;
        })
        .join('')}
    </div>
    <div class="booking-footer-nav">
      <span style="font-size: 0.82rem; color: var(--ink-light-muted)">Paso 1 de 4</span>
      <button type="button" class="btn btn--primary" id="btn-step1-next" ${
        !state.selectedServiceId ? 'disabled' : ''
      }>
        Continuar →
      </button>
    </div>
  `;

  container.querySelectorAll('[data-srv-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedServiceId = btn.dataset.srvId;
      state.selectedTime = null;
      renderStep1Service(container);
      updateSummary();
    });
  });

  container.querySelector('#btn-step1-next').addEventListener('click', () => goToStep(2));
}

function renderStep2Barber(container) {
  container.innerHTML = `
    <h3 class="step-heading">2. Elegí tu profesional</h3>
    <p class="step-sub">Podés elegir entre Agus, Lucho o ver todos los horarios disponibles de ambos.</p>
    <div class="barber-select-grid">
      <button type="button" class="barber-option ${
        state.selectedBarberId === 'any' ? 'is-selected' : ''
      }" data-barber-id="any">
        <div class="barber-option__avatar barber-option__avatar--any">D</div>
        <div>
          <div class="barber-option__name">Cualquier barbero</div>
          <div class="barber-option__role">Más horarios disponibles</div>
        </div>
      </button>
      ${state.barbers
        .map(
          (b) => `
          <button type="button" class="barber-option ${
            state.selectedBarberId === b.id ? 'is-selected' : ''
          }" data-barber-id="${esc(b.id)}">
            <img class="barber-option__avatar" src="${esc(b.photo)}" alt="${esc(b.name)}" />
            <div>
              <div class="barber-option__name">${esc(b.name)}</div>
              <div class="barber-option__role">★ ${Number(b.rating || 5).toFixed(1)} · ${esc(
            b.nickname
          )}</div>
            </div>
          </button>
        `
        )
        .join('')}
    </div>
    <div class="booking-footer-nav">
      <button type="button" class="btn btn--outline-light btn--sm" id="btn-step2-prev">← Volver</button>
      <button type="button" class="btn btn--primary" id="btn-step2-next">Ver horarios →</button>
    </div>
  `;

  container.querySelectorAll('[data-barber-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedBarberId = btn.dataset.barberId;
      state.selectedTime = null;
      renderStep2Barber(container);
      updateSummary();
    });
  });

  container.querySelector('#btn-step2-prev').addEventListener('click', () => goToStep(1));
  container.querySelector('#btn-step2-next').addEventListener('click', () => goToStep(3));
}

function renderStep3DateTime(container) {
  const today = getBuenosAiresNow().dateStr;
  const horizon = Number(state.settings.bookingHorizonDays || 21);
  const dates = [];
  for (let i = 0; i < horizon; i++) {
    const dt = addDays(today, i);
    const parts = getDateChipParts(dt);
    const dayCfg = state.settings.hours[String(parts.dow)];
    dates.push({ dateStr: dt, ...parts, open: Boolean(dayCfg && dayCfg.open) });
  }

  let slotsHtml = '';
  if (state.loadingSlots) {
    slotsHtml = `<div class="empty-slots">Consultando horarios disponibles...</div>`;
  } else if (state.availability?.closed) {
    slotsHtml = `<div class="empty-slots">${esc(state.availability.reason)}</div>`;
  } else if (!state.availability || state.availability.slots.length === 0) {
    slotsHtml = `<div class="empty-slots">No quedan turnos disponibles para este día. Probá otra fecha en la barra superior.</div>`;
  } else {
    const morning = state.availability.slots.filter((s) => Number(s.time.split(':')[0]) < 15);
    const afternoon = state.availability.slots.filter((s) => Number(s.time.split(':')[0]) >= 15);

    const renderGroup = (label, list) => {
      if (list.length === 0) return '';
      return `
        <div class="slots-group">
          <div class="slots-group__label">${label}</div>
          <div class="slots-grid">
            ${list
              .map(
                (slot) => `
                <button
                  type="button"
                  class="slot-btn tabular-nums ${state.selectedTime === slot.time ? 'is-selected' : ''}"
                  data-slot-time="${esc(slot.time)}"
                >
                  ${esc(slot.time)}
                </button>
              `
              )
              .join('')}
          </div>
        </div>
      `;
    };

    slotsHtml = renderGroup('Mediodía (11:00 — 14:45)', morning) + renderGroup('Tarde (15:00 — 20:00)', afternoon);
  }

  container.innerHTML = `
    <h3 class="step-heading">3. Elegí día y horario</h3>
    <p class="step-sub">Mostrando disponibilidad real para <strong>${esc(
      formatDateLong(state.selectedDate)
    )}</strong> (anticipación mínima: ${esc(state.settings.minNoticeMinutes)} min).</p>

    <div class="date-ribbon" id="date-ribbon">
      ${dates
        .map(
          (d) => `
          <button
            type="button"
            class="date-chip ${d.dateStr === state.selectedDate ? 'is-selected' : ''}"
            data-date="${esc(d.dateStr)}"
            ${!d.open ? 'disabled title="Cerrado"' : ''}
          >
            <span class="date-chip__dow">${esc(d.dowShort)}</span>
            <span class="date-chip__day tabular-nums">${esc(d.dayNum)}</span>
            <span class="date-chip__month">${d.open ? esc(d.monthShort) : 'Cerr.'}</span>
          </button>
        `
        )
        .join('')}
    </div>

    <div id="slots-container">${slotsHtml}</div>

    <div class="booking-footer-nav">
      <button type="button" class="btn btn--outline-light btn--sm" id="btn-step3-prev">← Volver</button>
      <button type="button" class="btn btn--primary" id="btn-step3-next" ${
        !state.selectedTime ? 'disabled' : ''
      }>
        Confirmar horario →
      </button>
    </div>
  `;

  container.querySelectorAll('[data-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedDate = btn.dataset.date;
      state.selectedTime = null;
      updateSummary();
      loadSlotsForSelectedDate();
    });
  });

  container.querySelectorAll('[data-slot-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedTime = btn.dataset.slotTime;
      renderStep3DateTime(container);
      updateSummary();
    });
  });

  container.querySelector('#btn-step3-prev').addEventListener('click', () => goToStep(2));
  container.querySelector('#btn-step3-next').addEventListener('click', () => goToStep(4));
}

async function loadSlotsForSelectedDate() {
  if (!state.selectedServiceId || !state.selectedDate) return;
  state.loadingSlots = true;
  if (state.step === 3) renderBookingStep();

  try {
    state.availability = await getAvailability({
      date: state.selectedDate,
      serviceId: state.selectedServiceId,
      barberId: state.selectedBarberId,
    });
  } catch (err) {
    state.availability = { closed: false, slots: [] };
    showToast(err.message || 'Error consultando horarios.', 'error');
  } finally {
    state.loadingSlots = false;
    if (state.step === 3) renderBookingStep();
  }
}

function renderStep4ClientForm(container) {
  container.innerHTML = `
    <h3 class="step-heading">4. Tus datos para reservar</h3>
    <p class="step-sub">No necesitás crear cuenta ni pagar por adelantado. Abonás directamente en el local.</p>

    <form id="booking-confirm-form">
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label" for="client-name">Nombre y apellido *</label>
          <input class="form-input" id="client-name" name="clientName" type="text" placeholder="Ej. Matías López" required minlength="2" />
        </div>
        <div class="form-field">
          <label class="form-label" for="client-phone">WhatsApp *</label>
          <input class="form-input" id="client-phone" name="clientPhone" type="tel" placeholder="Ej. 11 5432 8899" required />
        </div>
        <div class="form-field form-field--full">
          <label class="form-label" for="client-email">Email (opcional)</label>
          <input class="form-input" id="client-email" name="clientEmail" type="email" placeholder="Para tener registro de tu turno" />
        </div>
        <div class="form-field form-field--full">
          <label class="form-label" for="client-notes">Aclaración para el barbero (opcional)</label>
          <input class="form-input" id="client-notes" name="notes" type="text" placeholder="Ej. Mid fade, dejar largo arriba, primera visita..." maxlength="240" />
        </div>
      </div>

      <div class="booking-footer-nav">
        <button type="button" class="btn btn--outline-light btn--sm" id="btn-step4-prev">← Cambiar horario</button>
        <button type="submit" class="btn btn--accent" id="btn-submit-booking">
          Confirmar turno ahora
        </button>
      </div>
    </form>
  `;

  container.querySelector('#btn-step4-prev').addEventListener('click', () => goToStep(3));

  const form = container.querySelector('#booking-confirm-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = container.querySelector('#btn-submit-booking');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Confirmando...';

    try {
      const fd = new FormData(form);
      const { booking } = await createBooking({
        serviceId: state.selectedServiceId,
        barberId: state.selectedBarberId,
        date: state.selectedDate,
        time: state.selectedTime,
        clientName: fd.get('clientName'),
        clientPhone: fd.get('clientPhone'),
        clientEmail: fd.get('clientEmail'),
        notes: fd.get('notes'),
      });
      state.confirmedBooking = booking;
      updateStepTabs();
      renderBookingStep();
      showToast(`¡Turno confirmado! Código ${booking.code}`, 'success');
    } catch (err) {
      showToast(err.message || 'No pudimos confirmar el turno.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirmar turno ahora';
    }
  });
}

function renderReceipt(container) {
  const bk = state.confirmedBooking;
  const s = state.settings;
  const waText = `Hola Dual Barber! Acabo de reservar mi turno online:\n• Código: ${bk.code}\n• Servicio: ${bk.serviceName}\n• Profesional: ${bk.barberName}\n• Día y hora: ${formatDateLong(
    bk.date
  )} a las ${bk.time} hs\n• Nombre: ${bk.clientName}`;
  const waUrl = buildWhatsAppUrl(s.whatsappPrimary, waText);
  const gcalUrl = buildGoogleCalendarUrl(bk, s);

  container.innerHTML = `
    <div class="receipt-card">
      <span class="status-pill status-pill--confirmed">Turno confirmado</span>
      <h3 class="step-heading" style="margin-top: 0.75rem">¡Te esperamos, ${esc(bk.clientName)}!</h3>
      <p style="font-size: 0.9rem; color: var(--ink-light-secondary)">
        Guardá tu código de reserva por si necesitás modificar o cancelar el turno.
      </p>
      <div class="receipt-code tabular-nums">${esc(bk.code)}</div>

      <div class="receipt-details">
        <div>
          <div class="hero-strip__label">Servicio</div>
          <div style="font-weight: 700; margin-top: 0.2rem">${esc(bk.serviceName)} (${bk.durationMinutes} min)</div>
        </div>
        <div>
          <div class="hero-strip__label">Profesional</div>
          <div style="font-weight: 700; margin-top: 0.2rem">${esc(bk.barberName)}</div>
        </div>
        <div>
          <div class="hero-strip__label">Fecha y horario</div>
          <div style="font-weight: 700; margin-top: 0.2rem" class="tabular-nums">${esc(
            formatDateLong(bk.date)
          )} · ${esc(bk.time)} hs</div>
        </div>
        <div>
          <div class="hero-strip__label">Valor en el local</div>
          <div style="font-weight: 700; margin-top: 0.2rem" class="tabular-nums">${formatARS(
            bk.price
          )} <span style="color: var(--accent)">(${formatARS(bk.cashPrice)} efvo.)</span></div>
        </div>
      </div>

      <div class="receipt-actions">
        <a href="${esc(waUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn--accent btn--sm">
          Enviar comprobante por WhatsApp
        </a>
        <a href="${esc(gcalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-light btn--sm">
          Agregar a Google Calendar
        </a>
        <button type="button" class="btn btn--outline-light btn--sm" id="btn-download-ics">
          Descargar .ics
        </button>
        <button type="button" class="btn btn--ghost btn--sm" id="btn-new-booking">
          Agendar otro turno
        </button>
      </div>
    </div>
  `;

  container.querySelector('#btn-download-ics').addEventListener('click', () => downloadICS(bk, s));
  container.querySelector('#btn-new-booking').addEventListener('click', () => {
    state.confirmedBooking = null;
    state.selectedTime = null;
    goToStep(1);
  });
}

// ==========================================
// MODAL MIS TURNOS (REPROGRAMAR / CANCELAR)
// ==========================================
function setupMyBookingsModal() {
  const backdrop = document.getElementById('modal-my-bookings');
  const openBtn = document.getElementById('btn-open-my-bookings');
  const closeBtn = document.getElementById('btn-close-my-bookings');

  openBtn.addEventListener('click', openMyBookingsModal);
  closeBtn.addEventListener('click', closeMyBookingsModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeMyBookingsModal();
  });

  document.getElementById('lookup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = document.getElementById('lookup-input').value.trim();
    if (!q) return;
    await runLookup(q);
  });
}

function openMyBookingsModal() {
  const backdrop = document.getElementById('modal-my-bookings');
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  if (state.confirmedBooking) {
    const inp = document.getElementById('lookup-input');
    inp.value = state.confirmedBooking.code;
    runLookup(state.confirmedBooking.code);
  }
}

function closeMyBookingsModal() {
  const backdrop = document.getElementById('modal-my-bookings');
  backdrop.classList.remove('is-open');
  backdrop.setAttribute('aria-hidden', 'true');
  state.reschedulingCode = null;
}

async function runLookup(query) {
  const box = document.getElementById('lookup-results');
  box.innerHTML = `<p style="font-size: 0.86rem; color: var(--ink-light-secondary)">Buscando tus reservas...</p>`;
  try {
    const { bookings } = await lookupBookings(query);
    if (!bookings || bookings.length === 0) {
      box.innerHTML = `<p style="font-size: 0.88rem; color: var(--ink-light-secondary)">No encontramos turnos con “${esc(
        query
      )}”. Verificá el código (ej. DUAL-6342) o tu número de WhatsApp.</p>`;
      return;
    }
    renderLookupCards(bookings, query);
  } catch (err) {
    box.innerHTML = `<p style="font-size: 0.88rem; color: #e6887c">${esc(err.message)}</p>`;
  }
}

function renderLookupCards(bookings, originalQuery) {
  const box = document.getElementById('lookup-results');
  const maxMods = Number(state.settings?.maxModifications || 4);

  box.innerHTML = bookings
    .map((bk) => {
      const canEdit = bk.status === 'confirmed';
      const remaining = Math.max(0, maxMods - Number(bk.modificationsCount || 0));
      const isEditing = state.reschedulingCode === bk.code;

      return `
        <div class="my-booking-card">
          <div class="my-booking-card__top">
            <strong class="tabular-nums" style="color: var(--accent)">${esc(bk.code)}</strong>
            <span class="status-pill status-pill--${esc(bk.status)}">${esc(statusLabel(bk.status))}</span>
          </div>
          <div style="font-weight: 700; font-size: 1rem">${esc(bk.serviceName)} · ${esc(bk.barberName)}</div>
          <div style="font-size: 0.86rem; color: var(--ink-light-secondary); margin-top: 0.25rem">
            ${esc(formatDateLong(bk.date))} a las <strong class="tabular-nums">${esc(bk.time)} hs</strong>
            · ${formatARS(bk.price)} (${formatARS(bk.cashPrice)} efvo.)
          </div>

          ${
            canEdit && !isEditing
              ? `<div style="display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.95rem; align-items: center">
                  <button type="button" class="btn btn--outline-light btn--sm" data-start-reschedule="${esc(
                    bk.code
                  )}" data-srv="${esc(bk.serviceId)}" data-barber="${esc(bk.barberId)}" data-date="${esc(
                  bk.date
                )}" data-id="${esc(bk.id)}" ${remaining === 0 ? 'disabled' : ''}>
                    Reprogramar (${remaining} disp.)
                  </button>
                  <button type="button" class="btn btn--danger btn--sm" data-cancel-code="${esc(bk.code)}">
                    Cancelar turno
                  </button>
                </div>`
              : ''
          }

          ${
            isEditing
              ? `<div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-dark)">
                  <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.8rem">
                    <input type="date" class="form-input" style="max-width: 190px" id="resched-date-input" value="${esc(
                      state.rescheduleDate || bk.date
                    )}" min="${esc(getBuenosAiresNow().dateStr)}" />
                    <button type="button" class="btn btn--ghost btn--sm" id="btn-cancel-resched">Volver</button>
                  </div>
                  <div class="slots-grid" id="resched-slots-grid">
                    ${
                      state.rescheduleSlots.length > 0
                        ? state.rescheduleSlots
                            .map(
                              (sl) => `
                              <button type="button" class="slot-btn tabular-nums ${
                                state.rescheduleTime === sl.time ? 'is-selected' : ''
                              }" data-resched-time="${esc(sl.time)}">${esc(sl.time)}</button>
                            `
                            )
                            .join('')
                        : `<span style="grid-column: 1 / -1; font-size: 0.84rem; color: var(--ink-light-muted)">No hay horarios libres ese día. Elegí otra fecha (Mar a Sáb).</span>`
                    }
                  </div>
                  <div style="margin-top: 0.9rem">
                    <button type="button" class="btn btn--accent btn--sm" id="btn-confirm-resched" ${
                      !state.rescheduleTime ? 'disabled' : ''
                    }>Guardar nuevo horario</button>
                  </div>
                </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  box.querySelectorAll('[data-cancel-code]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.cancelCode;
      if (!confirm(`¿Seguro que querés cancelar tu turno ${code}?`)) return;
      try {
        await cancelBooking(code);
        showToast(`Turno ${code} cancelado correctamente.`, 'success');
        await runLookup(originalQuery);
        if (state.step === 3) loadSlotsForSelectedDate();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  box.querySelectorAll('[data-start-reschedule]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.reschedulingCode = btn.dataset.startReschedule;
      state.rescheduleDate = btn.dataset.date;
      state.rescheduleTime = null;
      await loadRescheduleSlots(btn.dataset.srv, btn.dataset.barber, btn.dataset.id);
      renderLookupCards(bookings, originalQuery);
      wireRescheduleControls(bookings, originalQuery);
    });
  });

  if (state.reschedulingCode) {
    wireRescheduleControls(bookings, originalQuery);
  }
}

async function loadRescheduleSlots(serviceId, barberId, excludeBookingId) {
  try {
    const avail = await getAvailability({
      date: state.rescheduleDate,
      serviceId,
      barberId,
      excludeBookingId,
    });
    state.rescheduleSlots = avail.slots || [];
  } catch {
    state.rescheduleSlots = [];
  }
}

function wireRescheduleControls(bookings, originalQuery) {
  const bk = bookings.find((b) => b.code === state.reschedulingCode);
  if (!bk) return;

  const dateInput = document.getElementById('resched-date-input');
  if (dateInput) {
    dateInput.addEventListener('change', async () => {
      state.rescheduleDate = dateInput.value;
      state.rescheduleTime = null;
      await loadRescheduleSlots(bk.serviceId, bk.barberId, bk.id);
      renderLookupCards(bookings, originalQuery);
    });
  }

  document.querySelectorAll('[data-resched-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rescheduleTime = btn.dataset.reschedTime;
      renderLookupCards(bookings, originalQuery);
    });
  });

  const cancelBtn = document.getElementById('btn-cancel-resched');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.reschedulingCode = null;
      renderLookupCards(bookings, originalQuery);
    });
  }

  const confirmBtn = document.getElementById('btn-confirm-resched');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      try {
        await rescheduleBooking(bk.code, {
          date: state.rescheduleDate,
          time: state.rescheduleTime,
          barberId: bk.barberId,
        });
        state.reschedulingCode = null;
        showToast(`Turno ${bk.code} reprogramado con éxito.`, 'success');
        await runLookup(originalQuery);
        if (state.step === 3) loadSlotsForSelectedDate();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

init();
