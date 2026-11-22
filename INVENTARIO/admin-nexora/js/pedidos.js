(function () {
  'use strict';

  const D = window.NEXORA_DATA;
  const UI = window.NEXORA_UI;
  if (!D || !UI) {
    console.error('Nexora: falta data-mock.js o layout.js');
    return;
  }

  const { db, onDataChange, createOrder, setOrderStatus, ORDER_STATUSES, ORDER_FLOW, COURIERS, dayKey } = D;
  const { initLayout, $, $$, esc, norm, fmt, badge, orderTone, emptyRow, renderPager, downloadCSV, toast, confirmDialog, openModal, closeModal, debounce } = UI;

  let ctx;

  document.addEventListener('DOMContentLoaded', () => {
    ctx = initLayout({ module: 'pedidos' });
    if (ctx) main();
  });

/* ==========================================================================
   NEXORA ADMIN · pedidos.js
   Gestión de pedidos web, cambio de estados y detalle de orden
   ========================================================================== */
function main() {
  const PAGE_SIZE = 10;
  const params = new URLSearchParams(location.search);
  const state = {
    status: ORDER_STATUSES.includes(params.get('status')) ? params.get('status') : '',
    q: '', channel: '', from: '', to: '', page: 1, openId: null,
  };
  const dlg = $('#orderDialog');
  const panel = $('#orderPanel');
  const STEP_ICONS = { Pendiente: 'ph-clock', Procesando: 'ph-gear-six', Enviado: 'ph-truck', Entregado: 'ph-package' };
  const nextStatus = (s) => ORDER_FLOW[ORDER_FLOW.indexOf(s) + 1] || null;

  /* ---------- Lista ---------- */
  const filtered = () => {
    const q = norm(state.q);
    return [...db.all('orders')].filter((o) =>
      (!state.status || o.status === state.status) && (!state.channel || o.channel === state.channel)
      && (!state.from || dayKey(o.date) >= state.from) && (!state.to || dayKey(o.date) <= state.to)
      && (!q || norm(`${o.id} ${o.customer.name} ${o.items.map((i) => i.name).join(' ')}`).includes(q)))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  function renderStrip() {
    const all = db.all('orders');
    const items = [['', 'Todos', all.length], ...ORDER_STATUSES.map((s) => [s, s, all.filter((o) => o.status === s).length])];
    $('#statusStrip').innerHTML = items.map(([val, label, n]) =>
      `<button type="button" class="status-chip" data-status="${val}" aria-pressed="${state.status === val}"><span>${label}</span><b>${fmt.int(n)}</b></button>`).join('');
  }

  function renderRows() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const slice = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    $('#orderRows').innerHTML = slice.length ? slice.map((o) => {
      const next = nextStatus(o.status);
      const first = o.items[0];
      const more = o.items.length - 1;
      const canAdvance = ctx.can('edit') && next && o.status !== 'Cancelado';
      return `<tr>
        <td><button type="button" class="link" data-view="${esc(o.id)}">${esc(o.id)}</button></td>
        <td>${esc(o.customer.name)}</td>
        <td class="muted" style="white-space:nowrap">${fmt.dateTime(o.date)}</td>
        <td>${badge(o.channel === 'web' ? 'Web' : 'Caja', o.channel === 'web' ? 'primary' : 'neutral', o.channel === 'web' ? 'ph-globe' : 'ph-storefront')}</td>
        <td><div class="order-products"><span>${esc(first.name)}${first.qty > 1 ? ` ×${first.qty}` : ''}</span>${more > 0 ? `<small>+${more} producto${more > 1 ? 's' : ''} más</small>` : ''}</div></td>
        <td class="num"><b>${fmt.money(o.total)}</b></td>
        <td class="muted">${esc(o.payment.method)}</td>
        <td>${badge(o.status, orderTone(o.status))}</td>
        <td class="col-actions"><div class="row-actions">
          ${canAdvance ? `<button type="button" class="row-btn row-btn--ok" data-quick="${esc(o.id)}" aria-label="Avanzar ${esc(o.id)} a ${next}" title="Avanzar a ${next}"><i class="ph ph-arrow-circle-right" aria-hidden="true"></i></button>` : ''}
          <button type="button" class="row-btn" data-view="${esc(o.id)}" aria-label="Ver detalle de ${esc(o.id)}" title="Ver detalle"><i class="ph ph-eye" aria-hidden="true"></i></button>
        </div></td></tr>`;
    }).join('') : emptyRow(9, 'No hay pedidos para los filtros seleccionados.', 'ph-package');
    renderPager($('#oPager'), { page: state.page, pageSize: PAGE_SIZE, total: list.length, noun: 'pedidos', onChange: (p) => { state.page = p; renderRows(); } });
  }

  /* ---------- Filtros ---------- */
  $('#statusStrip').addEventListener('click', (e) => { const b = e.target.closest('[data-status]'); if (b) { state.status = b.dataset.status; state.page = 1; renderStrip(); renderRows(); } });
  $('#oSearch').addEventListener('input', debounce((e) => { state.q = e.target.value; state.page = 1; renderRows(); }, 150));
  $('#oChannel').addEventListener('change', (e) => { state.channel = e.target.value; state.page = 1; renderRows(); });
  $('#oFrom').addEventListener('change', (e) => { state.from = e.target.value; state.page = 1; renderRows(); });
  $('#oTo').addEventListener('change', (e) => { state.to = e.target.value; state.page = 1; renderRows(); });

  $('#exportOrders').addEventListener('click', () => {
    const list = filtered();
    if (!list.length) { toast('No hay pedidos para exportar.', 'warning'); return; }
    downloadCSV(`pedidos-nexora-${dayKey(new Date())}.csv`,
      ['N° pedido', 'Fecha', 'Canal', 'Cliente', 'Productos', 'Subtotal', 'IGV', 'Descuento', 'Total', 'Pago', 'Estado'],
      list.map((o) => [o.id, fmt.dateTime(o.date), o.channel, o.customer.name, o.items.map((i) => `${i.name} x${i.qty}`).join(' | '), o.subtotal, o.igv, o.discountTotal, o.total, o.payment.method, o.status]));
    toast('Pedidos exportados a CSV.');
  });

  /* ---------- Detalle ---------- */
  function renderDetail(id) {
    const o = db.get('orders', id);
    if (!o) { closeModal(dlg); return; }
    state.openId = id;
    const terminal = o.status === 'Entregado' || o.status === 'Cancelado';
    const next = nextStatus(o.status);
    const canEdit = ctx.can('edit') && !terminal;
    const idx = ORDER_FLOW.indexOf(o.status);

    const stepper = o.channel === 'web' && o.status !== 'Cancelado' ? `
      <ol class="stepper" aria-label="Progreso del pedido">
        ${ORDER_FLOW.map((s, i) => `<li class="${i < idx ? 'is-done' : i === idx ? (o.status === 'Entregado' ? 'is-done' : 'is-current') : ''}" ${i === idx ? 'aria-current="step"' : ''}>
          <span class="stepper__dot"><i class="ph${i < idx || o.status === 'Entregado' ? '-fill ph-check' : ` ${STEP_ICONS[s]}`}" aria-hidden="true"></i></span>${s}</li>`).join('')}
      </ol>` : '';
    const banner = o.status === 'Cancelado'
      ? `<div class="banner banner--danger"><i class="ph-fill ph-x-circle" aria-hidden="true"></i> Pedido cancelado. El stock fue devuelto al inventario.</div>`
      : o.channel === 'caja' ? `<div class="banner banner--info"><i class="ph-fill ph-storefront" aria-hidden="true"></i> Venta realizada en caja${o.cashier ? ` por ${esc(o.cashier)}` : ''}. Entrega inmediata en tienda.</div>` : '';

    const ship = o.shipping ? `<div><dt>Courier</dt><dd>${esc(o.shipping.courier)}</dd></div><div><dt>Seguimiento</dt><dd>${esc(o.shipping.tracking)}</dd></div>` : '';
    const address = o.address ? `<div><dt>Dirección</dt><dd>${esc(o.address.line)}, ${esc(o.address.district)}</dd></div>` : '<div><dt>Entrega</dt><dd>Retiro en tienda</dd></div>';

    const items = o.items.map((l) => `
      <tr><td><b>${esc(l.name)}</b><br><small class="muted">${esc(l.sku)}</small></td>
      <td class="num">${l.qty}</td><td class="num">${fmt.money(l.listPrice)}</td>
      <td class="num">${l.discount ? `<span style="color:var(--success-ink)">−${fmt.money(l.discount)}</span>` : '—'}</td>
      <td class="num"><b>${fmt.money(l.qty * l.price)}</b></td></tr>`).join('');

    const history = [...o.history].reverse().map((h) => `
      <li><b>${esc(h.status)}</b><small>${fmt.dateTime(h.date)} · ${esc(h.by)}${h.note ? ` · ${esc(h.note)}` : ''}</small></li>`).join('');

    const shipForm = canEdit && next === 'Enviado' ? `
      <div class="ship-form" role="group" aria-label="Datos de envío">
        <div class="field"><label for="shipCourier">Courier <span class="req">*</span></label>
          <select id="shipCourier">${COURIERS.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="shipTracking">Código de seguimiento <span class="req">*</span></label>
          <input type="text" id="shipTracking" maxlength="30" placeholder="Ej. OLV12345678" autocomplete="off"></div>
      </div>` : '';

    panel.innerHTML = `
      <div class="od-head">
        <div><h2 id="odTitle">${esc(o.id)} ${badge(o.status, orderTone(o.status))}</h2><p>${fmt.dateTime(o.date)} · ${o.channel === 'web' ? 'Pedido web' : 'Venta de caja'}</p></div>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar detalle"><i class="ph ph-x" aria-hidden="true"></i></button>
      </div>
      <div class="od-body">
        ${stepper}${banner}
        <div class="od-grid">
          <section class="info-card"><h3><i class="ph-fill ph-user" aria-hidden="true"></i> Cliente</h3>
            <dl><div><dt>Nombre</dt><dd>${esc(o.customer.name)}</dd></div>
            ${o.customer.email ? `<div><dt>Correo</dt><dd>${esc(o.customer.email)}</dd></div>` : ''}
            ${o.customer.phone ? `<div><dt>Teléfono</dt><dd>${esc(o.customer.phone)}</dd></div>` : ''}
            ${o.customer.doc ? `<div><dt>Documento</dt><dd>${esc(o.customer.doc)}</dd></div>` : ''}</dl></section>
          <section class="info-card"><h3><i class="ph-fill ph-truck" aria-hidden="true"></i> Entrega y pago</h3>
            <dl>${address}${ship}<div><dt>Método de pago</dt><dd>${esc(o.payment.method)}</dd></div>
            ${o.payment.ref ? `<div><dt>Referencia</dt><dd>${esc(o.payment.ref)}</dd></div>` : ''}
            ${o.couponCode ? `<div><dt>Cupón</dt><dd>${esc(o.couponCode)}</dd></div>` : ''}</dl></section>
        </div>
        <section>
          <h3 class="od-section-title">Productos</h3>
          <div class="od-items table-wrap"><table class="table"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Dscto./u.</th><th class="num">Subtotal</th></tr></thead><tbody>${items}</tbody></table></div>
        </section>
        <div class="od-totals">
          <div><span>Subtotal (sin IGV)</span><span>${fmt.money(o.subtotal)}</span></div>
          ${o.discountTotal ? `<div><span>Descuentos aplicados</span><span style="color:var(--success-ink)">−${fmt.money(o.discountTotal)}</span></div>` : ''}
          <div><span>IGV (18%)</span><span>${fmt.money(o.igv)}</span></div>
          <div class="grand"><span>Total</span><b>${fmt.money(o.total)}</b></div>
        </div>
        <section><h3 class="od-section-title">Historial</h3><ol class="timeline">${history}</ol></section>
      </div>
      ${canEdit ? `<div class="od-foot">${shipForm}<div class="od-foot__row">
          <button type="button" class="btn btn--danger-ghost" data-cancel="${esc(o.id)}"><i class="ph ph-x-circle" aria-hidden="true"></i> Cancelar pedido</button>
          ${next ? `<button type="button" class="btn btn--primary" data-advance="${esc(o.id)}" data-to="${next}"><i class="ph ph-arrow-circle-right" aria-hidden="true"></i> Marcar como ${next}</button>` : ''}
        </div></div>` : ''}`;
  }

  function openDetail(id) {
    renderDetail(id);
    openModal(dlg);
  }
  dlg.addEventListener('close', () => { state.openId = null; });

  function advance(id, to, extra = {}) {
    if (!ctx.guard('edit')) return false;
    try { setOrderStatus(id, to, { by: ctx.user.name, ...extra }); toast(`${id} → ${to}`); return true; }
    catch (err) { toast(err.message, 'error'); return false; }
  }

  $('#orderRows').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { openDetail(v.dataset.view); return; }
    const q = e.target.closest('[data-quick]');
    if (!q) return;
    const o = db.get('orders', q.dataset.quick);
    const to = nextStatus(o.status);
    if (to === 'Enviado') { toast('Para marcar como Enviado indica courier y seguimiento.', 'info'); openDetail(o.id); return; }
    advance(o.id, to);
  });

  panel.addEventListener('click', async (e) => {
    const adv = e.target.closest('[data-advance]');
    if (adv) {
      const extra = adv.dataset.to === 'Enviado' ? { courier: $('#shipCourier')?.value, tracking: $('#shipTracking')?.value.trim() } : {};
      if (adv.dataset.to === 'Enviado' && !extra.tracking) { toast('Ingresa el código de seguimiento.', 'error'); $('#shipTracking')?.focus(); return; }
      advance(adv.dataset.advance, adv.dataset.to, extra);
      return;
    }
    const can = e.target.closest('[data-cancel]');
    if (can) {
      if (!ctx.guard('edit')) return;
      const ok = await confirmDialog({ title: `¿Cancelar el pedido ${can.dataset.cancel}?`, message: 'El stock de sus productos volverá al inventario y quedará registrado en el kardex.', confirmText: 'Cancelar pedido', danger: true });
      if (ok) advance(can.dataset.cancel, 'Cancelado', { note: 'Cancelado desde el panel' });
    }
  });

  /* ---------- Simular pedido web ---------- */
  $('#simulateOrder').addEventListener('click', () => {
    if (!ctx.guard('create')) return;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const customers = db.all('users').filter((u) => u.type === 'Cliente' && u.status === 'Activo');
    const stocked = db.all('products').filter((p) => p.status === 'Activo' && p.stock > 0);
    if (!customers.length || !stocked.length) { toast('No hay clientes o productos con stock para simular.', 'warning'); return; }
    const c = pick(customers);
    const chosen = [...stocked].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2));
    try {
      const o = createOrder({
        channel: 'web', status: 'Pendiente',
        customer: { id: c.id, name: c.name, email: c.email, phone: c.phone, doc: '' },
        address: { district: pick(['Miraflores', 'San Isidro', 'Surco', 'La Molina', 'Barranco']), line: `${pick(['Av. Larco', 'Av. Arequipa', 'Calle Los Pinos', 'Jr. Cusco'])} ${100 + Math.floor(Math.random() * 800)}` },
        items: chosen.map((p) => ({ productId: p.id, qty: 1 })),
        payment: { method: pick(['Tarjeta', 'Yape/Plin', 'Transferencia']), ref: '' },
      });
      state.status = ''; state.page = 1;
      toast(`Nuevo pedido web ${o.id} de ${c.name} por ${fmt.money(o.total)}.`, 'info');
    } catch (err) { toast(err.message, 'error'); }
  });

  function render() {
    renderStrip();
    renderRows();
    if (dlg.open && state.openId) renderDetail(state.openId);
  }
  render();
  onDataChange(render);

  const deepLink = params.get('order');
  if (deepLink && db.get('orders', deepLink)) openDetail(deepLink);
}

})();
