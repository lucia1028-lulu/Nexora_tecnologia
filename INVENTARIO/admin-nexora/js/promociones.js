(function () {
  'use strict';

  const D = window.NEXORA_DATA;
  const UI = window.NEXORA_UI;
  if (!D || !UI) {
    console.error('Nexora: falta data-mock.js o layout.js');
    return;
  }

  const { db, onDataChange, promoStatus, promoApplies, CATEGORIES, dayKey, addDays } = D;
  const { initLayout, $, $$, esc, norm, fmt, badge, toast, confirmDialog, openModal, closeModal, debounce } = UI;

  let ctx;

  document.addEventListener('DOMContentLoaded', () => {
    ctx = initLayout({ module: 'promociones' });
    if (ctx) main();
  });

/* ==========================================================================
   NEXORA ADMIN · promociones.js
   Creación y activación de descuentos por porcentaje/monto y fechas de vigencia
   ========================================================================== */
function main() {
  const STATUS_META = {
    Vigente: { tone: 'success', cls: 'vigente', icon: 'ph-lightning' },
    Programada: { tone: 'info', cls: 'programada', icon: 'ph-calendar-check' },
    Vencida: { tone: 'neutral', cls: 'vencida', icon: 'ph-hourglass' },
    Pausada: { tone: 'warning', cls: 'pausada', icon: 'ph-pause-circle' },
  };
  const state = { filter: 'Todas', editingId: null, selected: new Set() };
  const dlg = $('#promoDialog');
  const form = $('#promoForm');
  const F = {
    name: $('#prName'), desc: $('#prDesc'), value: $('#prValue'), scope: $('#prScope'), category: $('#prCategory'),
    code: $('#prCode'), active: $('#prActive'), start: $('#prStart'), end: $('#prEnd'),
  };
  const dateLabel = (key) => fmt.date(`${key}T00:00:00`);
  const typeOf = () => form.elements.prType.value;

  /* ---------- Render ---------- */
  function renderStats() {
    const list = db.all('promotions');
    const count = (s) => list.filter((p) => promoStatus(p) === s).length;
    const uses = list.reduce((a, p) => a + p.used, 0);
    $('#promoStats').innerHTML = `
      <div class="promo-stat promo-stat--ok"><i class="ph-fill ph-lightning" aria-hidden="true"></i><div><b>${count('Vigente')}</b><span>Vigentes</span></div></div>
      <div class="promo-stat promo-stat--soon"><i class="ph-fill ph-calendar-check" aria-hidden="true"></i><div><b>${count('Programada')}</b><span>Programadas</span></div></div>
      <div class="promo-stat promo-stat--code"><i class="ph-fill ph-ticket" aria-hidden="true"></i><div><b>${list.filter((p) => p.code).length}</b><span>Cupones creados</span></div></div>
      <div class="promo-stat promo-stat--use"><i class="ph-fill ph-chart-line-up" aria-hidden="true"></i><div><b>${fmt.int(uses)}</b><span>Usos totales</span></div></div>`;
  }

  function renderTabs() {
    const list = db.all('promotions');
    const items = ['Todas', 'Vigente', 'Programada', 'Vencida', 'Pausada'];
    $('#statusTabs').innerHTML = items.map((s) => {
      const n = s === 'Todas' ? list.length : list.filter((p) => promoStatus(p) === s).length;
      return `<button type="button" aria-pressed="${state.filter === s}" data-status="${s}">${s === 'Todas' ? 'Todas' : `${s}s`} <span class="badge badge--neutral">${n}</span></button>`;
    }).join('');
  }

  const scopeText = (p) => (p.scope === 'all' ? 'Toda la tienda' : p.scope === 'category' ? `Categoría: ${p.category}` : `${p.productIds.length} producto(s) seleccionado(s)`);

  function card(p) {
    const st = promoStatus(p);
    const meta = STATUS_META[st];
    const off = p.type === 'percent' ? `-${p.value}%` : `-S/ ${fmt.int(p.value)}`;
    return `<article class="promo-card promo-card--${meta.cls}">
      <div class="promo-card__value"><b>${off}</b><small>${p.type === 'percent' ? 'descuento' : 'por unidad'}</small></div>
      <div class="promo-card__main">
        <div class="promo-card__top"><h3>${esc(p.name)}</h3>${badge(st, meta.tone, meta.icon)}</div>
        ${p.description ? `<p class="promo-card__desc">${esc(p.description)}</p>` : ''}
        <ul class="promo-meta">
          <li><i class="ph ph-target" aria-hidden="true"></i>${esc(scopeText(p))}</li>
          <li><i class="ph ph-calendar-blank" aria-hidden="true"></i>${dateLabel(p.startDate)} → ${dateLabel(p.endDate)}</li>
          <li><i class="ph ph-receipt" aria-hidden="true"></i>${fmt.int(p.used)} ${p.used === 1 ? 'uso' : 'usos'}</li>
        </ul>
        ${p.code
          ? `<span class="coupon" title="Cupón de descuento">${esc(p.code)}<button type="button" data-copy="${esc(p.code)}" aria-label="Copiar cupón ${esc(p.code)}"><i class="ph ph-copy" aria-hidden="true"></i></button></span>`
          : '<span class="coupon coupon--auto"><i class="ph-fill ph-magic-wand" aria-hidden="true"></i>&nbsp;Descuento automático</span>'}
        <div class="promo-card__foot">
          <label class="check" title="Activar o pausar"><span class="switch"><input type="checkbox" data-toggle="${p.id}" ${p.active ? 'checked' : ''} ${ctx.can('edit') ? '' : 'disabled'} aria-label="Promoción activa: ${esc(p.name)}"><span></span></span> ${p.active ? 'Activa' : 'Pausada'}</label>
          ${ctx.can('edit') ? `<button type="button" class="row-btn" data-edit="${p.id}" aria-label="Editar ${esc(p.name)}" title="Editar"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>` : ''}
          ${ctx.can('delete') ? `<button type="button" class="row-btn row-btn--danger" data-delete="${p.id}" aria-label="Eliminar ${esc(p.name)}" title="Eliminar"><i class="ph ph-trash" aria-hidden="true"></i></button>` : ''}
        </div>
      </div>
    </article>`;
  }

  function render() {
    renderStats();
    renderTabs();
    const order = { Vigente: 0, Programada: 1, Pausada: 2, Vencida: 3 };
    const list = [...db.all('promotions')]
      .filter((p) => state.filter === 'Todas' || promoStatus(p) === state.filter)
      .sort((a, b) => order[promoStatus(a)] - order[promoStatus(b)] || a.endDate.localeCompare(b.endDate));
    $('#promoGrid').innerHTML = list.length ? list.map(card).join('')
      : '<div class="card" style="grid-column:1/-1"><div class="empty"><i class="ph ph-tag" aria-hidden="true"></i><h3>No hay promociones en este estado</h3><p>Crea una nueva campaña para comenzar.</p></div></div>';
  }

  /* ---------- Acciones de tarjeta ---------- */
  $('#statusTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-status]'); if (b) { state.filter = b.dataset.status; render(); } });

  $('#promoGrid').addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copy); toast(`Cupón ${copy.dataset.copy} copiado.`, 'info'); }
      catch { toast(`Cupón: ${copy.dataset.copy}`, 'info'); }
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openForm(ed.dataset.edit); return; }
    const del = e.target.closest('[data-delete]');
    if (del) {
      if (!ctx.guard('delete')) return;
      const p = db.get('promotions', del.dataset.delete);
      const ok = await confirmDialog({ title: `¿Eliminar "${p.name}"?`, message: 'Dejará de aplicarse en caja inmediatamente. Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true });
      if (ok) { db.remove('promotions', p.id); toast(`Promoción eliminada: ${p.name}`); }
    }
  });
  $('#promoGrid').addEventListener('change', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    if (!ctx.guard('edit')) { t.checked = !t.checked; return; }
    const p = db.update('promotions', t.dataset.toggle, { active: t.checked });
    toast(`"${p.name}" ${t.checked ? 'activada' : 'pausada'}.`, 'info');
  });
  $('#newPromo').addEventListener('click', () => openForm(null));

  /* ---------- Formulario ---------- */
  F.category.innerHTML = CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');

  function renderPicker() {
    const q = norm($('#pickSearch').value);
    const list = [...db.all('products')].sort((a, b) => a.name.localeCompare(b.name)).filter((p) => !q || norm(`${p.name} ${p.sku}`).includes(q));
    $('#pickList').innerHTML = list.map((p) => `
      <label class="check"><input type="checkbox" value="${p.id}" ${state.selected.has(p.id) ? 'checked' : ''}> <span>${esc(p.name)}</span><small>${esc(p.sku)} · ${fmt.money(p.price)}</small></label>`).join('')
      || '<p class="muted" style="padding:.5rem">Sin coincidencias.</p>';
  }

  function syncType() {
    const pct = typeOf() === 'percent';
    $('#prValueLabel').innerHTML = `${pct ? 'Descuento (%)' : 'Monto por unidad (S/)'} <span class="req">*</span>`;
    F.value.min = '1'; F.value.max = pct ? '90' : '99999'; F.value.step = pct ? '1' : '0.01';
    $('#prValueHint').textContent = pct ? 'Entre 1 % y 90 %.' : 'Se descuenta de cada unidad elegible.';
  }
  function syncScope() {
    $('#catField').hidden = F.scope.value !== 'category';
    $('#prodField').hidden = F.scope.value !== 'products';
    updateAffect();
  }
  function validateCode() {
    const code = F.code.value.trim().toUpperCase();
    const dup = code && db.all('promotions').find((p) => p.code && p.code.toUpperCase() === code && p.id !== state.editingId);
    F.code.setCustomValidity(dup ? 'Ese cupón ya existe' : '');
    $('#prCodeHint').textContent = dup ? `El cupón ya pertenece a "${dup.name}".` : 'Sin cupón = descuento automático.';
  }
  function validateDates() {
    F.end.setCustomValidity(F.start.value && F.end.value && F.end.value < F.start.value ? 'La fecha de fin debe ser posterior al inicio' : '');
  }
  function updateAffect() {
    const box = $('#affectInfo');
    const active = db.all('products').filter((p) => p.status === 'Activo');
    const probe = { scope: F.scope.value, category: F.category.value, productIds: [...state.selected] };
    const n = active.filter((p) => promoApplies(probe, p)).length;
    const empty = F.scope.value === 'products' && !state.selected.size;
    box.classList.toggle('affect--error', empty);
    box.innerHTML = empty
      ? '<i class="ph-fill ph-warning-circle" aria-hidden="true"></i> Selecciona al menos un producto.'
      : `<i class="ph-fill ph-target" aria-hidden="true"></i> Esta promoción afectará a <b>&nbsp;${n}&nbsp;</b> ${n === 1 ? 'producto activo' : 'productos activos'}.`;
  }

  function openForm(id) {
    if (!ctx.guard(id ? 'edit' : 'create')) return;
    state.editingId = id;
    form.reset();
    const p = id ? db.get('promotions', id) : null;
    $('#prTitle').textContent = p ? 'Editar promoción' : 'Nueva promoción';
    $('#prSave').textContent = p ? 'Guardar cambios' : 'Crear promoción';
    form.elements.prType.value = p?.type || 'percent';
    F.name.value = p?.name || '';
    F.desc.value = p?.description || '';
    F.value.value = p?.value ?? '';
    F.scope.value = p?.scope || 'all';
    F.category.value = p?.category || CATEGORIES[0];
    F.code.value = p?.code || '';
    F.active.checked = p ? p.active : true;
    F.start.value = p?.startDate || dayKey(new Date());
    F.end.value = p?.endDate || dayKey(addDays(new Date(), 14));
    state.selected = new Set(p?.productIds || []);
    $('#pickSearch').value = '';
    renderPicker(); syncType(); syncScope(); validateCode(); validateDates();
    openModal(dlg);
    F.name.focus();
  }

  $$('input[name="prType"]').forEach((r) => r.addEventListener('change', syncType));
  F.scope.addEventListener('change', syncScope);
  F.category.addEventListener('change', updateAffect);
  F.code.addEventListener('input', () => { F.code.value = F.code.value.toUpperCase(); validateCode(); });
  F.start.addEventListener('change', validateDates);
  F.end.addEventListener('change', validateDates);
  $('#pickSearch').addEventListener('input', debounce(renderPicker, 120));
  $('#pickList').addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    cb.checked ? state.selected.add(cb.value) : state.selected.delete(cb.value);
    updateAffect();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const editing = state.editingId;
    if (!ctx.guard(editing ? 'edit' : 'create')) return;
    validateCode(); validateDates();
    if (!form.reportValidity()) return;
    if (F.scope.value === 'products' && !state.selected.size) { toast('Selecciona al menos un producto.', 'error'); return; }

    const type = typeOf();
    const value = Number(F.value.value);
    if (type === 'percent' && (value < 1 || value > 90)) { toast('El porcentaje debe estar entre 1 y 90.', 'error'); return; }

    const data = {
      name: F.name.value.trim(), description: F.desc.value.trim(), type, value,
      scope: F.scope.value, category: F.scope.value === 'category' ? F.category.value : '',
      productIds: F.scope.value === 'products' ? [...state.selected] : [],
      code: F.code.value.trim().toUpperCase(), startDate: F.start.value, endDate: F.end.value, active: F.active.checked,
    };
    if (editing) { db.update('promotions', editing, data); toast(`Promoción actualizada: ${data.name}`); }
    else { db.insert('promotions', { id: db.nextId('promotions', 'PRM-', 3), ...data, used: 0 }); toast(`Promoción creada: ${data.name}`); }
    closeModal(dlg);
  });

  render();
  onDataChange(() => { render(); if (dlg.open) { renderPicker(); updateAffect(); } });
}

})();
