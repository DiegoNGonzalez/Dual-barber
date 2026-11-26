import {
  adminCreateBarber,
  adminCreateBlock,
  adminCreateBooking,
  adminCreateReview,
  adminCreateService,
  adminDeleteBlock,
  adminDeleteBooking,
  adminDeleteReview,
  adminDeleteService,
  adminImportBackup,
  adminLogin,
  adminResetDemo,
  adminSyncGoogleReviews,
  adminUpdateBarber,
  adminUpdateBooking,
  adminUpdateReview,
  adminUpdateService,
  adminUpdateSettings,
  getAdminState,
  getAdminToken,
  getAvailability,
  isLocalFallbackMode,
  setAdminToken,
} from './api.js';
import {
  addDays,
  buildWhatsAppUrl,
  calcCashPrice,
  esc,
  formatARS,
  formatDateLong,
  formatDateShort,
  getBuenosAiresNow,
  showToast,
  statusLabel,
} from './utils.js';

const adminState = {
  data: null,
  activeTab: 'agenda',
  agendaScope: 'upcoming', // today | tomorrow | upcoming | all | date
  agendaCustomDate: '',
  agendaBarberFilter: 'all',
};

// ==========================================
// INICIALIZACIÓN & LOGIN
// ==========================================
async function init() {
  setupLoginForm();
  setupNavigation();
  setupManualBookingModal();

  if (getAdminToken()) {
    try {
      await loadAndShowDashboard();
      return;
    } catch {
      setAdminToken('');
    }
  }
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('admin-login-screen').style.display = 'flex';
  document.getElementById('admin-app').style.display = 'none';
  document.getElementById('admin-pin-input').focus();
}

async function loadAndShowDashboard() {
  adminState.data = await getAdminState();
  document.getElementById('admin-login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'block';

  const modeBadge = document.getElementById('storage-mode-badge');
  modeBadge.textContent = isLocalFallbackMode()
    ? 'Modo Demo Local (navegador)'
    : 'Base de datos conectada';

  renderCurrentTab();
}

function setupLoginForm() {
  const form = document.getElementById('admin-login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('admin-pin-input').value.trim();
    const btn = document.getElementById('btn-admin-login');
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    try {
      await adminLogin(pin);
      document.getElementById('admin-pin-input').value = '';
      await loadAndShowDashboard();
      showToast('Bienvenido al panel de Dual Barber.', 'success');
    } catch (err) {
      showToast(err.message || 'PIN incorrecto.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar al panel';
    }
  });

  document.getElementById('btn-admin-logout').addEventListener('click', () => {
    setAdminToken('');
    showLoginScreen();
  });
}

function setupNavigation() {
  const allTabBtns = document.querySelectorAll('[data-tab]');
  allTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      adminState.activeTab = btn.dataset.tab;
      allTabBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.tab === adminState.activeTab));
      renderCurrentTab();
    });
  });
}

async function refreshState() {
  adminState.data = await getAdminState();
  renderCurrentTab();
}

function renderCurrentTab() {
  const main = document.getElementById('admin-main-content');
  if (!adminState.data) return;

  switch (adminState.activeTab) {
    case 'agenda':
      renderAgendaTab(main);
      break;
    case 'caja':
      renderCajaTab(main);
      break;
    case 'servicios':
      renderServicesTab(main);
      break;
    case 'equipo':
      renderTeamAndBlocksTab(main);
      break;
    case 'clientes':
      renderClientsTab(main);
      break;
    case 'config':
      renderConfigTab(main);
      break;
  }
}

// ==========================================
// TAB 1: AGENDA & TURNOS
// ==========================================
function renderAgendaTab(container) {
  const { bookings, barbers, settings } = adminState.data;
  const today = getBuenosAiresNow().dateStr;
  const tomorrow = addDays(today, 1);

  const todayBookings = bookings.filter((b) => b.date === today && b.status !== 'cancelled');
  const upcomingConfirmed = bookings.filter((b) => b.date >= today && b.status === 'confirmed');
  const todayRevenue = bookings
    .filter((b) => b.date === today && b.status === 'completed')
    .reduce((acc, b) => acc + Number(b.finalAmount ?? b.price), 0);
  const totalCompletedMonth = bookings.filter(
    (b) => b.date.slice(0, 7) === today.slice(0, 7) && b.status === 'completed'
  ).length;

  // Filtrado de turnos visibles
  let list = [...bookings];
  if (adminState.agendaScope === 'today') {
    list = list.filter((b) => b.date === today);
  } else if (adminState.agendaScope === 'tomorrow') {
    list = list.filter((b) => b.date === tomorrow);
  } else if (adminState.agendaScope === 'upcoming') {
    list = list.filter((b) => b.date >= today);
  } else if (adminState.agendaScope === 'date' && adminState.agendaCustomDate) {
    list = list.filter((b) => b.date === adminState.agendaCustomDate);
  }

  if (adminState.agendaBarberFilter !== 'all') {
    list = list.filter((b) => b.barberId === adminState.agendaBarberFilter);
  }

  list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  container.innerHTML = `
    <div class="admin-topbar">
      <div>
        <h1>Agenda de turnos</h1>
        <p class="admin-topbar__sub">${esc(formatDateLong(today))} · ${esc(settings.address)}</p>
      </div>
      <div style="display: flex; gap: 0.6rem; flex-wrap: wrap">
        <button type="button" class="btn btn--outline-light btn--sm" id="btn-refresh-agenda">Actualizar</button>
        <button type="button" class="btn btn--accent btn--sm" id="btn-open-manual-booking">+ Nuevo turno manual</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-card__label">Turnos hoy</div>
        <div class="kpi-card__value tabular-nums">${todayBookings.length}</div>
        <div class="kpi-card__note">${todayBookings.filter((b) => b.status === 'confirmed').length} por atender</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Próximos confirmados</div>
        <div class="kpi-card__value tabular-nums">${upcomingConfirmed.length}</div>
        <div class="kpi-card__note">Agenda online + manual</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Cobrado hoy</div>
        <div class="kpi-card__value tabular-nums" style="color: var(--accent)">${formatARS(todayRevenue)}</div>
        <div class="kpi-card__note">Incluye desc. efectivo</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Completados (mes)</div>
        <div class="kpi-card__value tabular-nums">${totalCompletedMonth}</div>
        <div class="kpi-card__note">Sin comisiones externas</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="filter-group">
        <button type="button" class="pill-btn ${adminState.agendaScope === 'upcoming' ? 'is-active' : ''}" data-scope="upcoming">Próximos</button>
        <button type="button" class="pill-btn ${adminState.agendaScope === 'today' ? 'is-active' : ''}" data-scope="today">Hoy</button>
        <button type="button" class="pill-btn ${adminState.agendaScope === 'tomorrow' ? 'is-active' : ''}" data-scope="tomorrow">Mañana</button>
        <button type="button" class="pill-btn ${adminState.agendaScope === 'all' ? 'is-active' : ''}" data-scope="all">Historial</button>
        <input type="date" class="form-input" id="agenda-date-filter" style="width: auto; padding: 0.42rem 0.65rem; font-size: 0.82rem" value="${esc(
          adminState.agendaCustomDate || today
        )}" />
      </div>

      <div class="filter-group">
        <button type="button" class="pill-btn ${adminState.agendaBarberFilter === 'all' ? 'is-active' : ''}" data-bfilter="all">Todos</button>
        ${barbers
          .map(
            (b) => `
            <button type="button" class="pill-btn ${
              adminState.agendaBarberFilter === b.id ? 'is-active' : ''
            }" data-bfilter="${esc(b.id)}">${esc(b.nickname || b.name)}</button>
          `
          )
          .join('')}
      </div>
    </div>

    <div class="agenda-list">
      ${
        list.length === 0
          ? `<div class="admin-card" style="text-align: center; color: var(--ink-light-secondary); padding: 2.5rem">
              No hay turnos para este filtro. Podés crear un turno manual con el botón superior.
            </div>`
          : list.map((bk) => renderAgendaRow(bk, settings)).join('')
      }
    </div>
  `;

  container.querySelector('#btn-refresh-agenda').addEventListener('click', refreshState);
  container.querySelector('#btn-open-manual-booking').addEventListener('click', openManualBookingModal);

  container.querySelectorAll('[data-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      adminState.agendaScope = btn.dataset.scope;
      renderAgendaTab(container);
    });
  });

  container.querySelector('#agenda-date-filter').addEventListener('change', (e) => {
    adminState.agendaCustomDate = e.target.value;
    adminState.agendaScope = 'date';
    renderAgendaTab(container);
  });

  container.querySelectorAll('[data-bfilter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      adminState.agendaBarberFilter = btn.dataset.bfilter;
      renderAgendaTab(container);
    });
  });

  // Acciones rápidas sobre cada turno
  container.querySelectorAll('[data-checkout-cash]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.checkoutCash;
      const amount = Number(btn.dataset.amount);
      await adminUpdateBooking(id, {
        status: 'completed',
        paymentMethod: 'efectivo',
        finalAmount: amount,
      });
      showToast(`Cobro en efectivo registrado (${formatARS(amount)}).`, 'success');
      await refreshState();
    });
  });

  container.querySelectorAll('[data-checkout-digital]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.checkoutDigital;
      const amount = Number(btn.dataset.amount);
      await adminUpdateBooking(id, {
        status: 'completed',
        paymentMethod: 'transferencia',
        finalAmount: amount,
      });
      showToast(`Cobro digital registrado (${formatARS(amount)}).`, 'success');
      await refreshState();
    });
  });

  container.querySelectorAll('[data-set-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.setStatus;
      await adminUpdateBooking(id, { status });
      showToast(`Estado actualizado a ${statusLabel(status)}.`, 'info');
      await refreshState();
    });
  });

  container.querySelectorAll('[data-delete-bk]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este turno del registro?')) return;
      await adminDeleteBooking(btn.dataset.deleteBk);
      showToast('Turno eliminado.', 'info');
      await refreshState();
    });
  });
}

function renderAgendaRow(bk, settings) {
  const waMsg = `Hola ${bk.clientName}! Te recordamos tu turno en Dual Barber (${settings.address}) el ${formatDateShort(
    bk.date
  )} a las ${bk.time} hs con ${bk.barberName} (${bk.serviceName}). ¡Te esperamos!`;
  const waLink = bk.clientPhone ? buildWhatsAppUrl(bk.clientPhone, waMsg) : '';
  const cashAmount = bk.cashPrice ?? calcCashPrice(bk.price, settings.cashDiscountPercent, true);

  return `
    <div class="agenda-item">
      <div class="agenda-item__time">
        <span class="agenda-item__hour tabular-nums">${esc(bk.time)}</span>
        <span class="agenda-item__date">${esc(formatDateShort(bk.date))}</span>
      </div>

      <div>
        <div class="agenda-item__client">
          <span>${esc(bk.clientName)}</span>
          <span class="status-pill status-pill--${esc(bk.status)}">${esc(statusLabel(bk.status))}</span>
          <span style="font-size: 0.76rem; color: var(--ink-light-muted)" class="tabular-nums">${esc(bk.code)}</span>
        </div>
        <div class="agenda-item__meta">
          <strong>${esc(bk.serviceName)}</strong> (${bk.durationMinutes} min) · Barbero: <strong>${esc(
    bk.barberName
  )}</strong>
          ${bk.clientPhone ? ` · Tel: ${esc(bk.clientPhone)}` : ''}
          ${
            bk.status === 'completed'
              ? ` · <span style="color: var(--accent)">Cobrado ${formatARS(bk.finalAmount ?? bk.price)} (${esc(
                  bk.paymentMethod || 'local'
                )})</span>`
              : ` · Lista ${formatARS(bk.price)} / Efvo ${formatARS(cashAmount)}`
          }
        </div>
        ${
          bk.notes
            ? `<div style="font-size: 0.8rem; color: var(--accent); margin-top: 0.25rem">Nota: ${esc(
                bk.notes
              )}</div>`
            : ''
        }
      </div>

      <div class="agenda-item__actions">
        ${
          waLink
            ? `<a href="${esc(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-light btn--sm">WhatsApp</a>`
            : ''
        }
        ${
          bk.status === 'confirmed' || bk.status === 'in_progress'
            ? `
              <button type="button" class="btn btn--accent btn--sm" data-checkout-cash="${esc(
                bk.id
              )}" data-amount="${cashAmount}">
                Cobrar Efvo (${formatARS(cashAmount)})
              </button>
              <button type="button" class="btn btn--outline-light btn--sm" data-checkout-digital="${esc(
                bk.id
              )}" data-amount="${bk.price}">
                Transf/Tarj (${formatARS(bk.price)})
              </button>
              <button type="button" class="btn btn--danger btn--sm" data-id="${esc(
                bk.id
              )}" data-set-status="cancelled">Cancelar</button>
            `
            : `
              <button type="button" class="btn btn--ghost btn--sm" data-delete-bk="${esc(bk.id)}">Eliminar</button>
            `
        }
      </div>
    </div>
  `;
}

// ==========================================
// TAB 2: CAJA Y MÉTRICAS
// ==========================================
function renderCajaTab(container) {
  const { bookings, barbers } = adminState.data;
  const completed = bookings.filter((b) => b.status === 'completed');

  const totalRev = completed.reduce((s, b) => s + Number(b.finalAmount ?? b.price), 0);
  const cashRev = completed
    .filter((b) => b.paymentMethod === 'efectivo')
    .reduce((s, b) => s + Number(b.finalAmount ?? b.price), 0);
  const digitalRev = totalRev - cashRev;
  const avgTicket = completed.length ? Math.round(totalRev / completed.length) : 0;

  const byBarber = barbers.map((barber) => {
    const mine = completed.filter((b) => b.barberId === barber.id);
    const rev = mine.reduce((s, b) => s + Number(b.finalAmount ?? b.price), 0);
    return { barber, count: mine.length, rev };
  });

  const byServiceMap = {};
  for (const bk of completed) {
    if (!byServiceMap[bk.serviceName]) byServiceMap[bk.serviceName] = { count: 0, rev: 0 };
    byServiceMap[bk.serviceName].count++;
    byServiceMap[bk.serviceName].rev += Number(bk.finalAmount ?? bk.price);
  }

  container.innerHTML = `
    <div class="admin-topbar">
      <div>
        <h1>Caja y métricas</h1>
        <p class="admin-topbar__sub">Control directo de facturación por medio de pago y profesional.</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-card__label">Facturación cobrada</div>
        <div class="kpi-card__value tabular-nums" style="color: var(--accent)">${formatARS(totalRev)}</div>
        <div class="kpi-card__note">${completed.length} servicios cobrados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Efectivo (10% OFF)</div>
        <div class="kpi-card__value tabular-nums">${formatARS(cashRev)}</div>
        <div class="kpi-card__note">Caja física en local</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Transferencia / Tarjeta</div>
        <div class="kpi-card__value tabular-nums">${formatARS(digitalRev)}</div>
        <div class="kpi-card__note">Cobros digitales</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Ticket promedio</div>
        <div class="kpi-card__value tabular-nums">${formatARS(avgTicket)}</div>
        <div class="kpi-card__note">Por cliente atendido</div>
      </div>
    </div>

    <div class="admin-grid-2">
      <div class="admin-card">
        <h2 class="admin-card__title">Rendimiento por barbero</h2>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Barbero</th><th>Cortes</th><th>Facturación</th></tr>
            </thead>
            <tbody>
              ${byBarber
                .map(
                  (row) => `
                  <tr>
                    <td><strong>${esc(row.barber.name)}</strong></td>
                    <td class="tabular-nums">${row.count}</td>
                    <td class="tabular-nums"><strong>${formatARS(row.rev)}</strong></td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-card">
        <h2 class="admin-card__title">Servicios cobrados</h2>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Servicio</th><th>Cant.</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${
                Object.keys(byServiceMap).length === 0
                  ? `<tr><td colspan="3">Todavía no hay cobros registrados.</td></tr>`
                  : Object.entries(byServiceMap)
                      .map(
                        ([name, info]) => `
                      <tr>
                        <td><strong>${esc(name)}</strong></td>
                        <td class="tabular-nums">${info.count}</td>
                        <td class="tabular-nums"><strong>${formatARS(info.rev)}</strong></td>
                      </tr>
                    `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// TAB 3: SERVICIOS Y PRECIOS
// ==========================================
function renderServicesTab(container) {
  const { services, settings } = adminState.data;
  const discount = Number(settings.cashDiscountPercent || 10);

  container.innerHTML = `
    <div class="admin-topbar">
      <div>
        <h1>Servicios y precios</h1>
        <p class="admin-topbar__sub">Editá precios o duración y se actualizan al instante en la web pública.</p>
      </div>
    </div>

    ${services
      .map((srv) => {
        const cash = calcCashPrice(srv.price, discount, srv.cashDiscountEligible);
        return `
        <form class="admin-card service-edit-form" data-srv-id="${esc(srv.id)}">
          <div class="admin-card__title">
            <span>${esc(srv.name)} ${!srv.active ? '(Pausado)' : ''}</span>
            <span style="font-size: 0.82rem; color: var(--accent)" class="tabular-nums">Efectivo: ${formatARS(cash)}</span>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <label class="form-label">Nombre del servicio</label>
              <input class="form-input" name="name" value="${esc(srv.name)}" required />
            </div>
            <div class="form-field">
              <label class="form-label">Precio lista (ARS)</label>
              <input class="form-input tabular-nums" type="number" name="price" value="${esc(srv.price)}" min="0" step="500" required />
            </div>
            <div class="form-field">
              <label class="form-label">Duración (minutos)</label>
              <select class="form-input" name="durationMinutes">
                ${[15, 30, 45, 60]
                  .map(
                    (m) =>
                      `<option value="${m}" ${Number(srv.durationMinutes) === m ? 'selected' : ''}>${m} min</option>`
                  )
                  .join('')}
              </select>
            </div>
            <div class="form-field">
              <label class="form-label">Etiqueta destacada (opcional)</label>
              <input class="form-input" name="badge" value="${esc(srv.badge || '')}" placeholder="Ej. Más elegido" />
            </div>
            <div class="form-field form-field--full">
              <label class="form-label">Descripción</label>
              <input class="form-input" name="description" value="${esc(srv.description || '')}" />
            </div>
          </div>
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.8rem; margin-top: 1rem">
            <div style="display: flex; gap: 1.2rem; flex-wrap: wrap; font-size: 0.84rem">
              <label style="display: inline-flex; align-items: center; gap: 0.45rem; cursor: pointer">
                <input type="checkbox" name="cashDiscountEligible" ${srv.cashDiscountEligible ? 'checked' : ''} />
                Aplica ${discount}% OFF efectivo
              </label>
              <label style="display: inline-flex; align-items: center; gap: 0.45rem; cursor: pointer">
                <input type="checkbox" name="active" ${srv.active ? 'checked' : ''} />
                Visible en la web
              </label>
            </div>
            <div style="display: flex; gap: 0.5rem">
              <button type="button" class="btn btn--danger btn--sm" data-del-srv="${esc(srv.id)}">Eliminar</button>
              <button type="submit" class="btn btn--primary btn--sm">Guardar cambios</button>
            </div>
          </div>
        </form>
      `;
      })
      .join('')}

    <form class="admin-card" id="new-service-form">
      <h2 class="admin-card__title">+ Agregar nuevo servicio</h2>
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label">Nombre *</label>
          <input class="form-input" name="name" placeholder="Ej. Perfilado de Cejas / Corte Niño" required />
        </div>
        <div class="form-field">
          <label class="form-label">Precio lista (ARS) *</label>
          <input class="form-input" type="number" name="price" placeholder="12000" min="0" step="500" required />
        </div>
        <div class="form-field">
          <label class="form-label">Duración *</label>
          <select class="form-input" name="durationMinutes">
            <option value="15">15 min</option>
            <option value="30" selected>30 min</option>
            <option value="45">45 min</option>
            <option value="60">60 min</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Descripción breve</label>
          <input class="form-input" name="description" placeholder="Qué incluye este servicio..." />
        </div>
      </div>
      <div style="margin-top: 1rem">
        <button type="submit" class="btn btn--accent btn--sm">Crear servicio</button>
      </div>
    </form>
  `;

  container.querySelectorAll('.service-edit-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = form.dataset.srvId;
      const fd = new FormData(form);
      await adminUpdateService(id, {
        name: fd.get('name'),
        price: Number(fd.get('price')),
        durationMinutes: Number(fd.get('durationMinutes')),
        badge: fd.get('badge'),
        description: fd.get('description'),
        cashDiscountEligible: form.querySelector('[name="cashDiscountEligible"]').checked,
        active: form.querySelector('[name="active"]').checked,
      });
      showToast('Servicio y precio actualizados en la web.', 'success');
      await refreshState();
    });
  });

  container.querySelectorAll('[data-del-srv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Seguro que querés eliminar este servicio?')) return;
      await adminDeleteService(btn.dataset.delSrv);
      showToast('Servicio eliminado.', 'info');
      await refreshState();
    });
  });

  container.querySelector('#new-service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await adminCreateService({
      name: fd.get('name'),
      price: Number(fd.get('price')),
      durationMinutes: Number(fd.get('durationMinutes')),
      description: fd.get('description'),
      cashDiscountEligible: true,
    });
    showToast('Nuevo servicio agregado.', 'success');
    await refreshState();
  });
}

// ==========================================
// TAB 4: EQUIPO Y BLOQUEOS DE HORARIOS
// ==========================================
function renderTeamAndBlocksTab(container) {
  const { barbers, blocks } = adminState.data;
  const days = [
    { d: 1, label: 'Lun' },
    { d: 2, label: 'Mar' },
    { d: 3, label: 'Mié' },
    { d: 4, label: 'Jue' },
    { d: 5, label: 'Vie' },
    { d: 6, label: 'Sáb' },
    { d: 0, label: 'Dom' },
  ];
  const today = getBuenosAiresNow().dateStr;

  container.innerHTML = `
    <div class="admin-topbar">
      <div>
        <h1>Equipo y bloqueos</h1>
        <p class="admin-topbar__sub">Administrá horarios de cada barbero, fotos de perfil y bloqueos de almuerzo o francos.</p>
      </div>
    </div>

    <div class="admin-grid-2">
      ${barbers
        .map(
          (b) => `
        <form class="admin-card barber-edit-form" data-barber-id="${esc(b.id)}">
          <div class="admin-card__title">
            <span>${esc(b.name)} (${esc(b.nickname)})</span>
            <label style="font-size: 0.78rem; font-weight: 500; display: inline-flex; gap: 0.4rem; align-items: center">
              <input type="checkbox" name="active" ${b.active ? 'checked' : ''} /> Activo
            </label>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <label class="form-label">Nombre completo</label>
              <input class="form-input" name="name" value="${esc(b.name)}" required />
            </div>
            <div class="form-field">
              <label class="form-label">Apodo</label>
              <input class="form-input" name="nickname" value="${esc(b.nickname)}" />
            </div>
            <div class="form-field">
              <label class="form-label">Desde</label>
              <input class="form-input" type="time" name="startTime" value="${esc(b.startTime)}" />
            </div>
            <div class="form-field">
              <label class="form-label">Hasta</label>
              <input class="form-input" type="time" name="endTime" value="${esc(b.endTime)}" />
            </div>
            <div class="form-field form-field--full">
              <label class="form-label">Especialidad / Bio</label>
              <input class="form-input" name="specialty" value="${esc(b.specialty || '')}" />
            </div>
            <div class="form-field form-field--full">
              <label class="form-label">URL o ruta de foto real</label>
              <input class="form-input" name="photo" value="${esc(b.photo || '')}" />
            </div>
            <div class="form-field form-field--full">
              <label class="form-label">Días laborales</label>
              <div class="day-check-row">
                ${days
                  .map(
                    (day) => `
                  <label class="day-check">
                    <input type="checkbox" name="workDays" value="${day.d}" ${
                      (b.workDays || []).includes(day.d) ? 'checked' : ''
                    } />
                    ${day.label}
                  </label>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>
          <div style="margin-top: 1rem">
            <button type="submit" class="btn btn--primary btn--sm">Guardar perfil</button>
          </div>
        </form>
      `
        )
        .join('')}
    </div>

    <div class="admin-grid-2">
      <form class="admin-card" id="new-block-form">
        <h2 class="admin-card__title">Bloquear horario o día libre</h2>
        <p style="font-size: 0.84rem; color: var(--ink-light-secondary); margin-bottom: 1rem">
          Los horarios bloqueados desaparecen al instante de la agenda online.
        </p>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Aplicar a</label>
            <select class="form-input" name="barberId">
              <option value="all">Toda la barbería (feriado / cierre)</option>
              ${barbers.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Fecha</label>
            <input class="form-input" type="date" name="date" value="${esc(today)}" required />
          </div>
          <div class="form-field">
            <label class="form-label">Desde</label>
            <input class="form-input" type="time" name="startTime" value="14:00" required />
          </div>
          <div class="form-field">
            <label class="form-label">Hasta</label>
            <input class="form-input" type="time" name="endTime" value="15:00" required />
          </div>
          <div class="form-field form-field--full">
            <label class="form-label">Motivo</label>
            <input class="form-input" name="reason" placeholder="Ej. Almuerzo, Trámite, Feriado..." required />
          </div>
        </div>
        <div style="margin-top: 1rem">
          <button type="submit" class="btn btn--accent btn--sm">Agregar bloqueo</button>
        </div>
      </form>

      <div class="admin-card">
        <h2 class="admin-card__title">Bloqueos activos (${blocks.length})</h2>
        ${
          blocks.length === 0
            ? `<p style="font-size: 0.86rem; color: var(--ink-light-muted)">No hay bloqueos cargados.</p>`
            : `<div class="agenda-list">
                ${blocks
                  .map((blk) => {
                    const who =
                      blk.barberId === 'all'
                        ? 'Todo el local'
                        : barbers.find((b) => b.id === blk.barberId)?.name || blk.barberId;
                    return `
                      <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--bg-surface); border-radius: var(--radius-xs); border: 1px solid var(--border-dark)">
                        <div>
                          <div style="font-weight: 700; font-size: 0.9rem">${esc(who)} · ${esc(blk.reason)}</div>
                          <div style="font-size: 0.8rem; color: var(--ink-light-secondary)" class="tabular-nums">
                            ${esc(formatDateShort(blk.date))} · ${esc(blk.startTime)} a ${esc(blk.endTime)} hs
                          </div>
                        </div>
                        <button type="button" class="btn btn--danger btn--sm" data-del-block="${esc(blk.id)}">Quitar</button>
                      </div>
                    `;
                  })
                  .join('')}
              </div>`
        }
      </div>
    </div>

    <form class="admin-card" id="new-barber-form">
      <h2 class="admin-card__title">+ Sumar un nuevo barbero al equipo</h2>
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label">Nombre completo *</label>
          <input class="form-input" name="name" placeholder="Ej. Mateo Ruiz" required />
        </div>
        <div class="form-field">
          <label class="form-label">Especialidad</label>
          <input class="form-input" name="specialty" placeholder="Cortes urbanos, navaja y barba" />
        </div>
      </div>
      <div style="margin-top: 1rem">
        <button type="submit" class="btn btn--outline-light btn--sm">Agregar profesional</button>
      </div>
    </form>
  `;

  container.querySelectorAll('.barber-edit-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = form.dataset.barberId;
      const fd = new FormData(form);
      const workDays = [...form.querySelectorAll('[name="workDays"]:checked')].map((c) => Number(c.value));
      await adminUpdateBarber(id, {
        name: fd.get('name'),
        nickname: fd.get('nickname'),
        startTime: fd.get('startTime'),
        endTime: fd.get('endTime'),
        specialty: fd.get('specialty'),
        photo: fd.get('photo'),
        workDays,
        active: form.querySelector('[name="active"]').checked,
      });
      showToast('Perfil del barbero actualizado.', 'success');
      await refreshState();
    });
  });

  container.querySelector('#new-block-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await adminCreateBlock({
        barberId: fd.get('barberId'),
        date: fd.get('date'),
        startTime: fd.get('startTime'),
        endTime: fd.get('endTime'),
        reason: fd.get('reason'),
      });
      showToast('Bloqueo aplicado a la agenda.', 'success');
      await refreshState();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelectorAll('[data-del-block]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await adminDeleteBlock(btn.dataset.delBlock);
      showToast('Bloqueo eliminado.', 'info');
      await refreshState();
    });
  });

  container.querySelector('#new-barber-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await adminCreateBarber({
      name: fd.get('name'),
      specialty: fd.get('specialty'),
      workDays: [2, 3, 4, 5, 6],
    });
    showToast('Nuevo profesional agregado.', 'success');
    await refreshState();
  });
}

// ==========================================
// TAB 5: CLIENTES (MINI CRM)
// ==========================================
function renderClientsTab(container) {
  const { bookings } = adminState.data;
  const map = new Map();

  for (const bk of bookings) {
    const key = (bk.clientPhone || bk.clientName).replace(/\D/g, '') || bk.clientName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        name: bk.clientName,
        phone: bk.clientPhone,
        email: bk.clientEmail,
        visits: 0,
        spent: 0,
        lastDate: bk.date,
        lastBarber: bk.barberName,
      });
    }
    const c = map.get(key);
    if (bk.status !== 'cancelled') c.visits++;
    if (bk.status === 'completed') c.spent += Number(bk.finalAmount ?? bk.price);
    if (bk.date >= c.lastDate) {
      c.lastDate = bk.date;
      c.lastBarber = bk.barberName;
    }
  }

  const clients = [...map.values()].sort((a, b) => b.visits - a.visits);

  container.innerHTML = `
    <div class="admin-topbar">
      <div>
        <h1>Base de clientes (${clients.length})</h1>
        <p class="admin-topbar__sub">Tu propia base de datos de clientes — 100% tuya, sin depender de plataformas externas.</p>
      </div>
    </div>

    <div class="admin-card">
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>WhatsApp</th>
              <th>Turnos</th>
              <th>Último barbero</th>
              <th>Total abonado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${clients
              .map((c) => {
                const waUrl = c.phone
                  ? buildWhatsAppUrl(
                      c.phone,
                      `Hola ${c.name}! Te escribimos desde Dual Barber. Cuando quieras te esperamos para tu próximo corte.`
                    )
                  : '';
                return `
                <tr>
                  <td><strong>${esc(c.name)}</strong><div style="font-size: 0.76rem">${esc(c.email || '')}</div></td>
                  <td class="tabular-nums">${esc(c.phone || '—')}</td>
                  <td class="tabular-nums">${c.visits}</td>
                  <td>${esc(c.lastBarber)}</td>
                  <td class="tabular-nums"><strong>${formatARS(c.spent)}</strong></td>
                  <td>
                    ${
                      waUrl
                        ? `<a href="${esc(waUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-light btn--sm">Escribir</a>`
                        : '—'
                    }
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ==========================================
// TAB 6: CONFIGURACIÓN, HORARIOS Y GOOGLE MAPS
// ==========================================
function renderConfigTab(container) {
  const { settings, reviews, googlePlacesConfigured } = adminState.data;
  const order = [1, 2, 3, 4, 5, 6, 0];

  container.innerHTML = `
    <div class="admin-topbar">
      <div>
        <h1>Negocio, reglas y Google Maps</h1>
        <p class="admin-topbar__sub">Configurá horarios, descuento en efectivo, PIN de acceso y las reseñas visibles de Google.</p>
      </div>
    </div>

    <form class="admin-card" id="settings-main-form">
      <h2 class="admin-card__title">Reglas de turnos y contacto</h2>
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label">Descuento en efectivo (%)</label>
          <input class="form-input tabular-nums" type="number" name="cashDiscountPercent" value="${esc(
            settings.cashDiscountPercent
          )}" min="0" max="50" />
        </div>
        <div class="form-field">
          <label class="form-label">Anticipación mínima (minutos)</label>
          <input class="form-input tabular-nums" type="number" name="minNoticeMinutes" value="${esc(
            settings.minNoticeMinutes
          )}" min="0" step="15" />
        </div>
        <div class="form-field">
          <label class="form-label">Máximo de modificaciones por cliente</label>
          <input class="form-input tabular-nums" type="number" name="maxModifications" value="${esc(
            settings.maxModifications
          )}" min="1" max="10" />
        </div>
        <div class="form-field">
          <label class="form-label">Cambiar PIN de acceso (dejar vacío para mantener)</label>
          <input class="form-input" type="password" name="newAdminPin" placeholder="Nuevo PIN (mín. 4 dígitos)" minlength="4" />
        </div>
        <div class="form-field">
          <label class="form-label">WhatsApp principal (con 549...)</label>
          <input class="form-input" name="whatsappPrimary" value="${esc(settings.whatsappPrimary)}" />
        </div>
        <div class="form-field">
          <label class="form-label">WhatsApp visible en web</label>
          <input class="form-input" name="whatsappPrimaryDisplay" value="${esc(settings.whatsappPrimaryDisplay)}" />
        </div>
        <div class="form-field form-field--full">
          <label class="form-label">Descripción de presentación</label>
          <textarea class="form-input" rows="2" name="aboutText">${esc(settings.aboutText)}</textarea>
        </div>
      </div>

      <h3 style="font-size: 0.92rem; margin: 1.4rem 0 0.7rem; color: var(--accent)">Horarios semanales del local</h3>
      <div>
        ${order
          .map((dow) => {
            const h = settings.hours[String(dow)];
            return `
            <div class="hours-editor-row" data-dow="${dow}">
              <strong>${esc(h.label)}</strong>
              <label style="display: inline-flex; gap: 0.4rem; align-items: center; font-size: 0.82rem">
                <input type="checkbox" class="hr-open" ${h.open ? 'checked' : ''} /> Abierto
              </label>
              <input class="form-input hr-start" type="time" value="${esc(h.start)}" />
              <input class="form-input hr-end" type="time" value="${esc(h.end)}" />
            </div>
          `;
          })
          .join('')}
      </div>

      <div style="margin-top: 1.2rem">
        <button type="submit" class="btn btn--primary btn--sm">Guardar configuración</button>
      </div>
    </form>

    <!-- INTEGRACIÓN GOOGLE MAPS -->
    <div class="admin-card">
      <div class="admin-card__title">
        <span>Integración Google Maps &amp; Reseñas</span>
        <button type="button" class="btn btn--accent btn--sm" id="btn-sync-google">
          Sincronizar Google Places API
        </button>
      </div>
      <p style="font-size: 0.84rem; color: var(--ink-light-secondary); margin-bottom: 1rem">
        ${
          googlePlacesConfigured
            ? 'Google Places API detectada en el servidor. Podés actualizar calificación y reseñas en 1 clic.'
            : 'Podés actualizar la calificación manualmente acá, o conectar GOOGLE_PLACES_API_KEY en .env + tu Google Place ID para sincronizar automáticamente desde Google Maps.'
        }
      </p>

      <form id="google-config-form" class="form-grid" style="margin-bottom: 1.4rem">
        <div class="form-field">
          <label class="form-label">Calificación Google (ej. 5.0)</label>
          <input class="form-input tabular-nums" type="number" step="0.1" min="1" max="5" name="googleRating" value="${esc(
            settings.googleRating
          )}" />
        </div>
        <div class="form-field">
          <label class="form-label">Cantidad total de reseñas en Google</label>
          <input class="form-input tabular-nums" type="number" name="googleReviewCount" value="${esc(
            settings.googleReviewCount
          )}" />
        </div>
        <div class="form-field">
          <label class="form-label">Link de perfil Google Maps</label>
          <input class="form-input" name="googleMapsUrl" value="${esc(settings.googleMapsUrl)}" />
        </div>
        <div class="form-field">
          <label class="form-label">Google Place ID (opcional para sync API)</label>
          <input class="form-input" name="googlePlaceId" value="${esc(settings.googlePlaceId || '')}" placeholder="ChIJ..." />
        </div>
        <div class="form-field form-field--full">
          <button type="submit" class="btn btn--outline-light btn--sm" style="width: fit-content">Guardar datos de Google Maps</button>
        </div>
      </form>

      <form id="new-review-form" style="padding-top: 1.1rem; border-top: 1px solid var(--border-dark); margin-bottom: 1.3rem">
        <h3 style="font-size: 0.9rem; margin-bottom: 0.7rem">Agregar reseña visible de Google Maps</h3>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Cliente *</label>
            <input class="form-input" name="author" placeholder="Ej. Lautaro M." required />
          </div>
          <div class="form-field">
            <label class="form-label">Servicio</label>
            <input class="form-input" name="service" placeholder="Corte y Barba" />
          </div>
          <div class="form-field form-field--full">
            <label class="form-label">Comentario *</label>
            <input class="form-input" name="text" placeholder="Pegá el comentario de Google Maps..." required />
          </div>
        </div>
        <button type="submit" class="btn btn--outline-light btn--sm" style="margin-top: 0.8rem">Agregar reseña</button>
      </form>

      <div class="agenda-list">
        ${reviews
          .map(
            (r) => `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.8rem; background: var(--bg-surface); border: 1px solid var(--border-dark); border-radius: var(--radius-xs)">
            <div>
              <strong>${esc(r.author)}</strong> · <span style="color: var(--accent)">${'★'.repeat(
              r.rating || 5
            )}</span>
              <div style="font-size: 0.83rem; color: var(--ink-light-secondary); margin-top: 0.2rem">“${esc(
                r.text
              )}”</div>
            </div>
            <div style="display: flex; gap: 0.45rem; flex-shrink: 0">
              <button type="button" class="pill-btn ${r.featured ? 'is-active' : ''}" data-toggle-rev="${esc(
              r.id
            )}" data-featured="${r.featured ? '1' : '0'}">
                ${r.featured ? 'Destacada' : 'Oculta'}
              </button>
              <button type="button" class="btn btn--danger btn--sm" data-del-rev="${esc(r.id)}">✕</button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>

    <!-- RESPALDO & DEMO -->
    <div class="admin-card">
      <h2 class="admin-card__title">Respaldo y datos de demostración</h2>
      <div style="display: flex; flex-wrap: wrap; gap: 0.7rem">
        <button type="button" class="btn btn--outline-light btn--sm" id="btn-export-json">Exportar respaldo JSON</button>
        <label class="btn btn--outline-light btn--sm" style="cursor: pointer">
          Importar respaldo JSON
          <input type="file" id="input-import-json" accept="application/json" style="display: none" />
        </label>
        <button type="button" class="btn btn--danger btn--sm" id="btn-reset-demo">Restaurar datos demo iniciales</button>
      </div>
    </div>
  `;

  container.querySelector('#settings-main-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const hours = { ...settings.hours };
    container.querySelectorAll('.hours-editor-row').forEach((row) => {
      const dow = row.dataset.dow;
      hours[dow] = {
        ...hours[dow],
        open: row.querySelector('.hr-open').checked,
        start: row.querySelector('.hr-start').value,
        end: row.querySelector('.hr-end').value,
      };
    });

    const patch = {
      cashDiscountPercent: Number(fd.get('cashDiscountPercent')),
      minNoticeMinutes: Number(fd.get('minNoticeMinutes')),
      cancelNoticeMinutes: Number(fd.get('minNoticeMinutes')),
      maxModifications: Number(fd.get('maxModifications')),
      whatsappPrimary: fd.get('whatsappPrimary'),
      whatsappPrimaryDisplay: fd.get('whatsappPrimaryDisplay'),
      aboutText: fd.get('aboutText'),
      hours,
    };
    const newPin = String(fd.get('newAdminPin') || '').trim();
    if (newPin.length >= 4) patch.newAdminPin = newPin;

    await adminUpdateSettings(patch);
    showToast('Configuración guardada.', 'success');
    await refreshState();
  });

  container.querySelector('#google-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await adminUpdateSettings({
      googleRating: Number(fd.get('googleRating')),
      googleReviewCount: Number(fd.get('googleReviewCount')),
      googleMapsUrl: fd.get('googleMapsUrl'),
      googlePlaceId: fd.get('googlePlaceId'),
    });
    showToast('Datos de Google Maps actualizados en la web.', 'success');
    await refreshState();
  });

  container.querySelector('#btn-sync-google').addEventListener('click', async () => {
    try {
      const res = await adminSyncGoogleReviews();
      showToast(`Google Maps sincronizado: ${res.rating} ★ (${res.reviewCount} reseñas).`, 'success');
      await refreshState();
    } catch (err) {
      showToast(err.message, 'info');
    }
  });

  container.querySelector('#new-review-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await adminCreateReview({
      author: fd.get('author'),
      service: fd.get('service') || 'Cliente Google',
      text: fd.get('text'),
      rating: 5,
      source: 'Google Maps',
      featured: true,
    });
    showToast('Reseña agregada y publicada.', 'success');
    await refreshState();
  });

  container.querySelectorAll('[data-toggle-rev]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.featured !== '1';
      await adminUpdateReview(btn.dataset.toggleRev, { featured: next });
      await refreshState();
    });
  });

  container.querySelectorAll('[data-del-rev]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await adminDeleteReview(btn.dataset.delRev);
      showToast('Reseña eliminada.', 'info');
      await refreshState();
    });
  });

  container.querySelector('#btn-export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(adminState.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dual-barber-respaldo-${getBuenosAiresNow().dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  container.querySelector('#input-import-json').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await adminImportBackup(parsed);
      showToast('Respaldo importado con éxito.', 'success');
      await refreshState();
    } catch (err) {
      showToast(err.message || 'No se pudo importar el JSON.', 'error');
    }
  });

  container.querySelector('#btn-reset-demo').addEventListener('click', async () => {
    if (!confirm('¿Restaurar todos los datos de demostración de Dual Barber?')) return;
    await adminResetDemo();
    showToast('Datos demo restaurados.', 'success');
    await refreshState();
  });
}

// ==========================================
// MODAL TURNO MANUAL (WALK-IN / WHATSAPP)
// ==========================================
function setupManualBookingModal() {
  const backdrop = document.getElementById('modal-manual-booking');
  const close = () => {
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
  };

  document.getElementById('btn-close-manual').addEventListener('click', close);
  document.getElementById('btn-cancel-manual').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const reloadManualSlots = async () => {
    const serviceId = document.getElementById('mb-service').value;
    const barberId = document.getElementById('mb-barber').value;
    const date = document.getElementById('mb-date').value;
    const timeSelect = document.getElementById('mb-time');
    if (!serviceId || !barberId || !date) return;

    timeSelect.innerHTML = `<option value="">Consultando...</option>`;
    try {
      const avail = await getAvailability({ date, serviceId, barberId, admin: true });
      const slots = avail.slots || [];
      if (slots.length === 0) {
        timeSelect.innerHTML = `<option value="">Sin horarios disponibles</option>`;
      } else {
        timeSelect.innerHTML = slots
          .map((s) => `<option value="${esc(s.time)}">${esc(s.time)} hs</option>`)
          .join('');
      }
    } catch {
      timeSelect.innerHTML = `<option value="">Error cargando horarios</option>`;
    }
  };

  ['mb-service', 'mb-barber', 'mb-date'].forEach((id) => {
    document.getElementById(id).addEventListener('change', reloadManualSlots);
  });

  document.getElementById('manual-booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const time = document.getElementById('mb-time').value;
    if (!time) {
      showToast('Elegí una fecha con horarios disponibles.', 'error');
      return;
    }
    try {
      await adminCreateBooking({
        serviceId: document.getElementById('mb-service').value,
        barberId: document.getElementById('mb-barber').value,
        date: document.getElementById('mb-date').value,
        time,
        clientName: document.getElementById('mb-name').value,
        clientPhone: document.getElementById('mb-phone').value,
        notes: document.getElementById('mb-notes').value,
      });
      close();
      e.target.reset();
      showToast('Turno manual agendado correctamente.', 'success');
      await refreshState();
    } catch (err) {
      showToast(err.message || 'No se pudo agendar.', 'error');
    }
  });

  window.__reloadManualSlots = reloadManualSlots;
}

function openManualBookingModal() {
  const { services, barbers } = adminState.data;
  const srvSel = document.getElementById('mb-service');
  const barbSel = document.getElementById('mb-barber');
  const dateInp = document.getElementById('mb-date');

  srvSel.innerHTML = services
    .filter((s) => s.active)
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.durationMinutes}m · ${formatARS(s.price)})</option>`)
    .join('');

  barbSel.innerHTML = barbers
    .filter((b) => b.active)
    .map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`)
    .join('');

  dateInp.value = getBuenosAiresNow().dateStr;
  const backdrop = document.getElementById('modal-manual-booking');
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  window.__reloadManualSlots();
}

init();
