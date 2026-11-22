/* ==========================================================================
   NEXORA ADMIN · inventario.js
   Entradas/salidas de stock, alertas de stock mínimo y kardex básico
   ========================================================================== */
import { db, onDataChange, adjustStock, stockLevel, CATEGORIES, dayKey } from './data-mock.js';
import { initLayout, $, $$, esc, norm, fmt, badge, emptyRow, renderPager, downloadCSV, toast, openModal, closeModal, debounce } from './layout.js';

const ctx = initLayout({ module: 'inventario' });
if (ctx) main();

function main() {
  const PAGE_SIZE = 12;
  const REASONS = {
    Entrada: ['Compra a proveedor', 'Devolución de cliente', 'Transferencia entre almacenes', 'Otro'],
    Salida: ['Merma / daño', 'Uso interno / demostración', 'Devolución a proveedor', 'Otro'],
    Ajuste: ['Corrección por conteo físico', 'Otro'],
  };
  const state = { tab: 'stock', q: '', cat: '', level: '', k: { product: '', type: '', from: '', to: '', page: 1 } };

  const dlg = $('#moveDialog');
  const form = $('#moveForm');

  /* ---------- Resumen ---------- */
  function renderStats() {
    const all = db.all('products');
    const active = all.filter((p) => p.status === 'Activo');
    const units = all.reduce((a, p) => a + p.stock, 0);
    const value = all.reduce((a, p) => a + p.stock * p.cost, 0);
    const crit = active.filter((p) => ['out', 'critical'].includes(stockLevel(p).key)).length;
    const low = active.filter((p) => stockLevel(p).key === 'low').length;
    $('#invStats').innerHTML = `
      <div class="inv-stat"><span>Productos (SKU)</span><b>${all.length}</b></div>
      <div class="inv-stat"><span>Unidades en stock</span><b>${fmt.int(units)}</b></div>
      <div class="inv-stat"><span>Valor al costo</span><b>${fmt.money(value)}</b></div>
      <div class="inv-stat inv-stat--danger"><span>Stock crítico / agotado</span><b>${crit}</b></div>
      <div class="inv-stat inv-stat--warning"><span>Stock bajo</span><b>${low}</b></div>`;
    $('#alertCount').textContent = crit + low;
    $('#alertCount').hidden = crit + low === 0;
  }

  /* ---------- Stock ---------- */
  function renderStock() {
    const q = norm(state.q);
    const rows = [...db.all('products')]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((p) => (!state.cat || p.category === state.cat) && (!state.level || stockLevel(p).key === state.level)
        && (!q || norm(`${p.name} ${p.sku} ${p.brand}`).includes(q)));

    $('#stockRows').innerHTML = rows.length ? rows.map((p) => {
      const lvl = stockLevel(p);
      const pct = Math.min(100, Math.round((p.stock / Math.max(p.minStock * 2, 1)) * 100));
      const barTone = lvl.key === 'ok' ? '' : lvl.tone === 'danger' ? 'progress--danger' : 'progress--warning';
      return `<tr class="${p.status === 'Inactivo' ? 'row-inactive' : ''}">
        <td><div class="cell-product"><img src="${esc(p.image)}" alt="" loading="lazy" width="46" height="46"><div><b>${esc(p.name)}</b><small>${esc(p.sku)} · ${esc(p.brand)}${p.status === 'Inactivo' ? ' · Inactivo' : ''}</small></div></div></td>
        <td>${esc(p.category)}</td>
        <td class="num"><span class="stock-num ${lvl.tone === 'success' ? '' : `stock-num--${lvl.tone}`}">${p.stock}</span></td>
        <td class="num muted">${p.minStock}</td>
        <td><div class="level"><div class="progress ${barTone}"><span style="width:${pct}%"></span></div><small>${pct}% del objetivo</small></div></td>
        <td>${badge(lvl.label, lvl.tone)}</td>
        <td class="num">${fmt.money(p.stock * p.cost)}</td>
        <td class="col-actions"><div class="row-actions">
          ${ctx.can('create') ? `<button type="button" class="row-btn row-btn--ok" data-act="Entrada" data-id="${p.id}" aria-label="Registrar entrada de ${esc(p.name)}" title="Entrada"><i class="ph ph-arrow-down-left" aria-hidden="true"></i></button>
          <button type="button" class="row-btn row-btn--danger" data-act="Salida" data-id="${p.id}" aria-label="Registrar salida de ${esc(p.name)}" title="Salida" ${p.stock <= 0 ? 'disabled' : ''}><i class="ph ph-arrow-up-right" aria-hidden="true"></i></button>` : ''}
          ${ctx.can('edit') ? `<button type="button" class="row-btn" data-act="Ajuste" data-id="${p.id}" aria-label="Ajustar stock de ${esc(p.name)}" title="Ajustar"><i class="ph ph-sliders" aria-hidden="true"></i></button>` : ''}
          <button type="button" class="row-btn" data-act="kardex" data-id="${p.id}" aria-label="Ver kardex de ${esc(p.name)}" title="Kardex"><i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i></button>
        </div></td></tr>`;
    }).join('') : emptyRow(8, 'No hay productos que coincidan con los filtros.');
  }

  /* ---------- Kardex ---------- */
  const kardexFiltered = () => {
    const { product, type, from, to } = state.k;
    return [...db.all('movements')]
      .filter((m) => (!product || m.productId === product) && (!type || m.type === type)
        && (!from || dayKey(m.date) >= from) && (!to || dayKey(m.date) <= to))
      .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));
  };

  function renderKardex() {
    const list = kardexFiltered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.k.page = Math.min(state.k.page, pages);
    const slice = list.slice((state.k.page - 1) * PAGE_SIZE, state.k.page * PAGE_SIZE);
    const tone = { Entrada: 'success', Salida: 'danger', Ajuste: 'info' };

    $('#kardexRows').innerHTML = slice.length ? slice.map((m) => `
      <tr>
        <td class="muted" style="white-space:nowrap">${fmt.dateTime(m.date)}</td>
        <td><b>${esc(m.productName)}</b><br><small class="muted">${esc(m.sku)}</small></td>
        <td>${badge(m.type, tone[m.type])}</td>
        <td>${esc(m.reason)}${m.note ? `<br><small class="muted">${esc(m.note)}</small>` : ''}</td>
        <td class="muted">${esc(m.reference || '—')}</td>
        <td class="num">${m.delta > 0 ? `<span class="qty-in">+${m.delta}</span>` : '<span class="muted">—</span>'}</td>
        <td class="num">${m.delta < 0 ? `<span class="qty-out">−${Math.abs(m.delta)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="num"><span class="balance">${m.balance}</span></td>
        <td>${esc(m.user)}</td>
      </tr>`).join('') : emptyRow(9, 'No hay movimientos para este filtro.');

    renderPager($('#kPager'), { page: state.k.page, pageSize: PAGE_SIZE, total: list.length, noun: 'movimientos', onChange: (p) => { state.k.page = p; renderKardex(); } });

    const sum = $('#kSummary');
    if (state.k.product) {
      const p = db.get('products', state.k.product);
      const ins = list.reduce((a, m) => a + Math.max(0, m.delta), 0);
      const outs = list.reduce((a, m) => a + Math.max(0, -m.delta), 0);
      sum.hidden = false;
      sum.innerHTML = `<span>Producto: <b>${esc(p?.name || '')}</b></span><span>Stock actual: <b>${p?.stock ?? 0}</b></span><span>Entradas: <b>+${fmt.int(ins)}</b></span><span>Salidas: <b>−${fmt.int(outs)}</b></span>`;
    } else sum.hidden = true;
  }

  /* ---------- Alertas ---------- */
  function renderAlerts() {
    const list = db.all('products')
      .filter((p) => p.status === 'Activo' && stockLevel(p).key !== 'ok')
      .sort((a, b) => stockLevel(a).rank - stockLevel(b).rank || a.stock - b.stock);
    $('#alertList').innerHTML = list.length ? list.map((p) => {
      const lvl = stockLevel(p);
      const suggest = Math.max(p.minStock * 2 - p.stock, p.minStock);
      return `<article class="alert-card ${lvl.tone === 'danger' ? 'alert-card--danger' : ''}">
        <div class="alert-card__top"><img src="${esc(p.image)}" alt="" loading="lazy" width="56" height="56"><div><b>${esc(p.name)}</b><small>${esc(p.sku)} · ${esc(p.category)}</small></div>${badge(lvl.label, lvl.tone)}</div>
        <div class="alert-card__nums"><span>Stock actual<b>${p.stock}</b></span><span>Mínimo<b>${p.minStock}</b></span><span>Costo unit.<b>${fmt.money(p.cost)}</b></span></div>
        <div class="alert-card__suggest"><span>Reponer <b>${suggest}</b> u. · ${fmt.money(suggest * p.cost)}</span>
          ${ctx.can('create') ? `<button type="button" class="btn btn--primary btn--sm" data-restock="${p.id}" data-qty="${suggest}"><i class="ph ph-arrow-down-left" aria-hidden="true"></i> Registrar entrada</button>` : ''}</div>
      </article>`;
    }).join('') : '<div class="card"><div class="empty"><i class="ph-fill ph-check-circle" style="color:var(--success)" aria-hidden="true"></i><h3>Sin alertas de stock</h3><p>Todos los productos activos están sobre su nivel mínimo.</p></div></div>';
  }

  /* ---------- Pestañas ---------- */
  function setTab(name, { focus = false } = {}) {
    state.tab = name;
    $$('#invTabs [role="tab"]').forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    ['stock', 'kardex', 'alertas'].forEach((n) => { $(`#panel-${n}`).hidden = n !== name; });
    history.replaceState(null, '', name === 'stock' ? location.pathname : `#${name}`);
  }
  $('#invTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) setTab(t.dataset.tab); });
  $('#invTabs').addEventListener('keydown', (e) => {
    const order = ['stock', 'kardex', 'alertas'];
    const i = order.indexOf(state.tab);
    if (e.key === 'ArrowRight') setTab(order[(i + 1) % 3], { focus: true });
    if (e.key === 'ArrowLeft') setTab(order[(i + 2) % 3], { focus: true });
  });

  /* ---------- Filtros ---------- */
  const catSel = $('#sCategory');
  catSel.innerHTML = '<option value="">Todas las categorías</option>' + CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
  catSel.addEventListener('change', () => { state.cat = catSel.value; renderStock(); });
  $('#sLevel').addEventListener('change', (e) => { state.level = e.target.value; renderStock(); });
  $('#sSearch').addEventListener('input', debounce((e) => { state.q = e.target.value; renderStock(); }, 150));

  function fillProductSelects() {
    const opts = [...db.all('products')].sort((a, b) => a.name.localeCompare(b.name));
    const kSel = $('#kProduct');
    const kCur = kSel.value;
    kSel.innerHTML = '<option value="">Todos los productos</option>' + opts.map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join('');
    kSel.value = kCur;
    const mSel = $('#mProduct');
    const mCur = mSel.value;
    mSel.innerHTML = opts.map((p) => `<option value="${p.id}">${esc(p.name)} · stock ${p.stock}</option>`).join('');
    if (mCur) mSel.value = mCur;
  }
  $('#kProduct').addEventListener('change', (e) => { state.k.product = e.target.value; state.k.page = 1; renderKardex(); });
  $('#kType').addEventListener('change', (e) => { state.k.type = e.target.value; state.k.page = 1; renderKardex(); });
  $('#kFrom').addEventListener('change', (e) => { state.k.from = e.target.value; state.k.page = 1; renderKardex(); });
  $('#kTo').addEventListener('change', (e) => { state.k.to = e.target.value; state.k.page = 1; renderKardex(); });
  $('#kClear').addEventListener('click', () => {
    state.k = { product: '', type: '', from: '', to: '', page: 1 };
    $('#kProduct').value = ''; $('#kType').value = ''; $('#kFrom').value = ''; $('#kTo').value = '';
    renderKardex();
  });

  $('#exportKardex').addEventListener('click', () => {
    const list = kardexFiltered();
    if (!list.length) { toast('No hay movimientos para exportar.', 'warning'); return; }
    downloadCSV(`kardex-nexora-${dayKey(new Date())}.csv`,
      ['Fecha', 'SKU', 'Producto', 'Tipo', 'Motivo', 'Referencia', 'Cantidad', 'Saldo', 'Usuario'],
      list.map((m) => [fmt.dateTime(m.date), m.sku, m.productName, m.type, m.reason, m.reference, m.delta, m.balance, m.user]));
    toast('Kardex exportado a CSV.');
  });

  /* ---------- Acciones de fila ---------- */
  $('#stockRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'kardex') {
      state.k = { product: b.dataset.id, type: '', from: '', to: '', page: 1 };
      $('#kProduct').value = b.dataset.id;
      renderKardex();
      setTab('kardex');
      return;
    }
    openMove({ productId: b.dataset.id, type: b.dataset.act });
  });
  $('#alertList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-restock]');
    if (b) openMove({ productId: b.dataset.restock, type: 'Entrada', qty: Number(b.dataset.qty), reason: 'Compra a proveedor' });
  });
  $('#newMove').addEventListener('click', () => openMove({}));

  /* ---------- Modal de movimiento ---------- */
  const currentType = () => form.elements.type.value;

  function syncType() {
    const type = currentType();
    const qty = $('#mQty');
    $('#mQtyLabel').innerHTML = `${type === 'Ajuste' ? 'Nuevo stock total' : 'Cantidad'} <span class="req">*</span>`;
    qty.min = type === 'Ajuste' ? '0' : '1';
    const keep = $('#mReason').value;
    $('#mReason').innerHTML = REASONS[type].map((r) => `<option>${esc(r)}</option>`).join('');
    if (REASONS[type].includes(keep)) $('#mReason').value = keep;
    updatePreview();
  }

  function updatePreview() {
    const p = db.get('products', $('#mProduct').value);
    const box = $('#movePreview');
    if (!p) { box.textContent = ''; return; }
    const type = currentType();
    const n = Math.floor(Number($('#mQty').value));
    const valid = Number.isFinite(n) && $('#mQty').value !== '';
    let next = p.stock;
    if (valid) next = type === 'Entrada' ? p.stock + n : type === 'Salida' ? p.stock - n : n;
    const bad = valid && next < 0;
    box.classList.toggle('move-preview--error', bad);
    box.innerHTML = bad
      ? `<i class="ph-fill ph-warning-circle" aria-hidden="true"></i> Stock insuficiente: solo hay <b>${p.stock}</b> unidades.`
      : `Stock actual <b>${p.stock}</b> <i class="ph ph-arrow-right arrow" aria-hidden="true"></i> Stock resultante <b>${valid ? next : '—'}</b>`;
  }

  function openMove({ productId, type = 'Entrada', qty = '', reason = '' } = {}) {
    if (!ctx.guard(type === 'Ajuste' ? 'edit' : 'create', 'Tu rol no puede registrar este tipo de movimiento.')) return;
    form.reset();
    fillProductSelects();
    if (productId) $('#mProduct').value = productId;
    form.elements.type.value = type;
    $('#mQty').value = qty;
    if (type === 'Ajuste' && productId && qty === '') $('#mQty').value = db.get('products', productId).stock;
    syncType();
    if (reason && REASONS[type].includes(reason)) $('#mReason').value = reason;
    updatePreview();
    openModal(dlg);
    $('#mQty').focus();
  }

  // Los tipos que el usuario no puede registrar quedan deshabilitados
  $$('input[name="type"]', form).forEach((r) => {
    r.addEventListener('change', syncType);
    const need = r.value === 'Ajuste' ? 'edit' : 'create';
    if (!ctx.can(need)) { r.disabled = true; r.closest('label').title = 'Sin permiso'; }
  });
  $('#mProduct').addEventListener('change', updatePreview);
  $('#mQty').addEventListener('input', updatePreview);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = currentType();
    if (!ctx.guard(type === 'Ajuste' ? 'edit' : 'create')) return;
    try {
      const mov = adjustStock({
        productId: $('#mProduct').value, type, qty: Number($('#mQty').value), reason: $('#mReason').value,
        reference: $('#mRef').value.trim(), note: $('#mNote').value.trim(), user: ctx.user.name,
      });
      closeModal(dlg);
      toast(`${type} registrada: ${mov.productName} → stock ${mov.balance}.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* ---------- Render global + tiempo real ---------- */
  function render() {
    renderStats();
    renderStock();
    renderKardex();
    renderAlerts();
    fillProductSelects();
    if (dlg.open) updatePreview();
  }
  render();
  onDataChange(render);

  const initial = location.hash.replace('#', '');
  if (['kardex', 'alertas'].includes(initial)) setTab(initial);
}
