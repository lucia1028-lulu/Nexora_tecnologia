(function () {
  'use strict';

  const D = window.NEXORA_DATA;
  const UI = window.NEXORA_UI;
  if (!D || !UI) {
    console.error('Nexora: falta data-mock.js o layout.js');
    return;
  }

  const { db, onDataChange, adjustStock, stockLevel, bestPromo, CATEGORIES, SPEC_FIELDS, SKU_PREFIX } = D;
  const { initLayout, $, $$, esc, norm, fmt, badge, emptyRow, toast, confirmDialog, openModal, closeModal, debounce } = UI;

  let ctx;

  document.addEventListener('DOMContentLoaded', () => {
    ctx = initLayout({ module: 'productos' });
    if (ctx) main();
  });

/* ==========================================================================
   NEXORA ADMIN · productos.js
   CRUD completo de laptops, PCs y componentes (SKU, marca, especificaciones,
   precio, estado). El stock inicial genera su entrada en el kardex.
   ========================================================================== */
function main() {
  const VIEW_KEY = 'nexora.admin.productsView';
  const state = { q: '', cat: '', brand: '', status: '', view: window.NEXORA_STORE.getItem(VIEW_KEY) || 'grid', editingId: null, skuTouched: false };
  const dlg = $('#productDialog');
  const form = $('#productForm');
  const F = {
    name: $('#pName'), category: $('#pCategory'), brand: $('#pBrand'), sku: $('#pSku'), status: $('#pStatus'),
    price: $('#pPrice'), cost: $('#pCost'), stock: $('#pStock'), min: $('#pMin'), image: $('#pImage'), desc: $('#pDesc'),
  };

  const margin = (p) => (p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0);
  const marginClass = (m) => (m >= 22 ? 'good' : m >= 12 ? 'mid' : 'bad');
  const specValues = (p) => Object.values(p.specs || {}).filter(Boolean);

  /* ---------- Filtros ---------- */
  function fillFilters() {
    const brands = [...new Set(db.all('products').map((p) => p.brand))].sort((a, b) => a.localeCompare(b));
    const cat = $('#fCategory'), br = $('#fBrand');
    const [cv, bv] = [cat.value, br.value];
    cat.innerHTML = '<option value="">Todas las categorías</option>' + CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
    br.innerHTML = '<option value="">Todas las marcas</option>' + brands.map((b) => `<option>${esc(b)}</option>`).join('');
    cat.value = cv; br.value = brands.includes(bv) ? bv : '';
    $('#brandList').innerHTML = brands.map((b) => `<option value="${esc(b)}"></option>`).join('');
  }
  $('#fSearch').addEventListener('input', debounce((e) => { state.q = e.target.value; render(); }, 150));
  $('#fCategory').addEventListener('change', (e) => { state.cat = e.target.value; render(); });
  $('#fBrand').addEventListener('change', (e) => { state.brand = e.target.value; render(); });
  $('#fStatus').addEventListener('change', (e) => { state.status = e.target.value; render(); });
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; window.NEXORA_STORE.setItem(VIEW_KEY, state.view); render(); }));

  const filtered = () => {
    const q = norm(state.q);
    return [...db.all('products')].sort((a, b) => a.name.localeCompare(b.name)).filter((p) =>
      (!state.cat || p.category === state.cat) && (!state.brand || p.brand === state.brand) && (!state.status || p.status === state.status)
      && (!q || norm(`${p.name} ${p.sku} ${p.brand} ${specValues(p).join(' ')}`).includes(q)));
  };

  /* ---------- Render ---------- */
  const actionButtons = (p) => `
    ${ctx.can('edit') ? `<button type="button" class="row-btn" data-edit="${p.id}" aria-label="Editar ${esc(p.name)}" title="Editar"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>` : ''}
    ${ctx.can('delete') ? `<button type="button" class="row-btn row-btn--danger" data-delete="${p.id}" aria-label="Eliminar ${esc(p.name)}" title="Eliminar"><i class="ph ph-trash" aria-hidden="true"></i></button>` : ''}`;

  function card(p) {
    const lvl = stockLevel(p);
    const promo = p.status === 'Activo' ? bestPromo(p) : null;
    const price = promo ? p.price - promo.discount : p.price;
    return `<article class="p-card ${p.status === 'Inactivo' ? 'p-card--inactive' : ''}">
      <div class="p-card__media">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" width="480" height="360">
        <div class="p-card__tags">${badge(p.category, 'neutral')}${promo ? `<span class="badge badge--promo"><i class="ph-fill ph-tag" aria-hidden="true"></i>-${Math.round((promo.discount / p.price) * 100)}%</span>` : ''}</div>
      </div>
      <div class="p-card__body">
        <p class="p-card__meta">${esc(p.brand)} · ${esc(p.sku)}</p>
        <h3>${esc(p.name)}</h3>
        <ul class="chips">${specValues(p).slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="p-card__price"><b>${fmt.money(price)}</b>${promo ? `<s>${fmt.money(p.price)}</s>` : ''}</div>
        <div class="p-card__foot">
          ${badge(`${lvl.label} · ${p.stock}`, lvl.tone)}
          <label class="status-toggle" title="${p.status === 'Activo' ? 'Activo en tienda' : 'Inactivo'}"><span class="switch"><input type="checkbox" data-toggle="${p.id}" ${p.status === 'Activo' ? 'checked' : ''} ${ctx.can('edit') ? '' : 'disabled'} aria-label="Producto activo: ${esc(p.name)}"><span></span></span></label>
          ${actionButtons(p)}
        </div>
      </div>
    </article>`;
  }

  function row(p) {
    const lvl = stockLevel(p);
    const m = margin(p);
    return `<tr class="${p.status === 'Inactivo' ? 'row-inactive' : ''}">
      <td><div class="cell-product"><img src="${esc(p.image)}" alt="" loading="lazy" width="46" height="46"><div><b>${esc(p.name)}</b><small>${esc(p.sku)} · ${esc(p.brand)}</small></div></div></td>
      <td>${esc(p.category)}</td>
      <td class="num"><b>${fmt.money(p.price)}</b></td>
      <td class="num muted">${fmt.money(p.cost)}</td>
      <td class="num"><span class="margin margin--${marginClass(m)}">${m.toFixed(1)}%</span></td>
      <td class="num">${badge(`${p.stock}`, lvl.tone)}</td>
      <td>${badge(p.status, p.status === 'Activo' ? 'success' : 'neutral')}</td>
      <td class="col-actions"><div class="row-actions">${actionButtons(p)}</div></td></tr>`;
  }

  function render() {
    fillFilters();
    const list = filtered();
    $('#results').innerHTML = `Mostrando <b>${list.length}</b> de ${db.all('products').length} productos`;
    $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
    $('#gridView').hidden = state.view !== 'grid';
    $('#tableView').hidden = state.view !== 'table';
    if (state.view === 'grid') {
      $('#gridView').innerHTML = list.length ? list.map(card).join('') : '<div class="card" style="grid-column:1/-1"><div class="empty"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><h3>Sin resultados</h3><p>Ajusta los filtros o crea un nuevo producto.</p></div></div>';
    } else {
      $('#tableRows').innerHTML = list.length ? list.map(row).join('') : emptyRow(8, 'Sin resultados para los filtros actuales.');
    }
  }

  /* ---------- Acciones ---------- */
  document.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { openForm(ed.dataset.edit); return; }
    const del = e.target.closest('[data-delete]');
    if (del) {
      if (!ctx.guard('delete')) return;
      const p = db.get('products', del.dataset.delete);
      if (!p) return;
      const ok = await confirmDialog({
        title: `¿Eliminar "${p.name}"?`,
        message: p.stock > 0 ? `Tiene ${p.stock} unidades en stock. El historial del kardex y los pedidos se conservan. Considera desactivarlo en lugar de eliminarlo.` : 'El historial del kardex y los pedidos se conservan. Esta acción no se puede deshacer.',
        confirmText: 'Eliminar', danger: true,
      });
      if (ok) { db.remove('products', p.id); toast(`Producto eliminado: ${p.name}`); }
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    if (!ctx.guard('edit')) { t.checked = !t.checked; return; }
    const p = db.get('products', t.dataset.toggle);
    db.update('products', p.id, { status: t.checked ? 'Activo' : 'Inactivo' });
    toast(`${p.name} ${t.checked ? 'activado' : 'desactivado'}.`, 'info');
  });
  $('#newProduct').addEventListener('click', () => openForm(null));

  /* ---------- Formulario ---------- */
  F.category.innerHTML = CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');

  function nextSku(category) {
    const prefix = SKU_PREFIX[category] || 'PRD';
    const max = db.all('products').reduce((m, p) => {
      const mt = new RegExp(`^${prefix}-(\\d+)$`).exec(p.sku);
      return mt ? Math.max(m, Number(mt[1])) : m;
    }, 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  function renderSpecs(values = {}) {
    const fields = SPEC_FIELDS[F.category.value] || [];
    $('#specFields').innerHTML = fields.map((f) => `
      <div class="field"><label for="spec_${f.key}">${esc(f.label)}</label>
      <input type="text" id="spec_${f.key}" data-spec="${f.key}" maxlength="60" placeholder="${esc(f.ph)}" value="${esc(values[f.key] || '')}"></div>`).join('');
  }
  const currentSpecs = () => Object.fromEntries($$('[data-spec]').map((i) => [i.dataset.spec, i.value.trim()]).filter(([, v]) => v));

  function updateMargin() {
    const price = Number(F.price.value), cost = Number(F.cost.value);
    const hint = $('#marginHint');
    if (!price || F.cost.value === '') { hint.textContent = ''; return; }
    const m = ((price - cost) / price) * 100;
    hint.textContent = `Margen bruto: ${m.toFixed(1)}%`;
    hint.style.color = m < 0 ? 'var(--danger-ink)' : '';
  }
  function updateImage() {
    const url = F.image.value.trim();
    $('#pImgPrev').src = /^https?:\/\//i.test(url) ? url : 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><rect width="480" height="360" fill="#EEF2FF"/><text x="240" y="190" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#818CF8">Vista previa</text></svg>');
  }
  function validateSku() {
    const sku = F.sku.value.trim().toUpperCase();
    const dup = db.all('products').find((p) => p.sku.toUpperCase() === sku && p.id !== state.editingId);
    F.sku.setCustomValidity(dup ? `El SKU ya está asignado a "${dup.name}"` : '');
    $('#skuHint').textContent = dup ? F.sku.validationMessage : 'Código único del producto.';
  }

  function openForm(id) {
    if (!ctx.guard(id ? 'edit' : 'create')) return;
    state.editingId = id;
    state.skuTouched = !!id;
    form.reset();
    const p = id ? db.get('products', id) : null;
    $('#pdTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';
    $('#pdSub').textContent = p ? `${p.sku} · última edición en este navegador` : 'Completa los datos comerciales y técnicos.';
    $('#pdSave').textContent = p ? 'Guardar cambios' : 'Crear producto';

    F.category.value = p ? p.category : CATEGORIES[0];
    F.name.value = p?.name || '';
    F.brand.value = p?.brand || '';
    F.sku.value = p ? p.sku : nextSku(F.category.value);
    F.status.value = p?.status || 'Activo';
    F.price.value = p?.price ?? '';
    F.cost.value = p?.cost ?? '';
    F.min.value = p?.minStock ?? 3;
    F.image.value = p?.image || '';
    F.desc.value = p?.description || '';
    // El stock solo se fija al crear; luego se gestiona desde Inventario (kardex)
    F.stock.value = p ? p.stock : 0;
    F.stock.disabled = !!p;
    $('#pStockLabel').textContent = p ? 'Stock actual' : 'Stock inicial';
    $('#stockHint').innerHTML = p ? 'Modifícalo desde <a class="link" href="inventario.html">Inventario</a> para mantener el kardex.' : 'Generará una entrada en el kardex.';
    renderSpecs(p?.specs);
    updateMargin(); updateImage(); validateSku();
    openModal(dlg);
    F.name.focus();
  }

  F.category.addEventListener('change', () => {
    renderSpecs(currentSpecs());
    if (!state.skuTouched) { F.sku.value = nextSku(F.category.value); validateSku(); }
  });
  F.sku.addEventListener('input', () => { state.skuTouched = true; F.sku.value = F.sku.value.toUpperCase(); validateSku(); });
  F.price.addEventListener('input', updateMargin);
  F.cost.addEventListener('input', updateMargin);
  F.image.addEventListener('input', debounce(updateImage, 250));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const editing = state.editingId;
    if (!ctx.guard(editing ? 'edit' : 'create')) return;
    validateSku();
    if (!form.reportValidity()) return;

    const price = Math.round(Number(F.price.value) * 100) / 100;
    const cost = Math.round(Number(F.cost.value) * 100) / 100;
    const data = {
      name: F.name.value.trim(), category: F.category.value, brand: F.brand.value.trim(), sku: F.sku.value.trim().toUpperCase(),
      status: F.status.value, price, cost, minStock: Math.max(0, Math.floor(Number(F.min.value) || 0)),
      image: F.image.value.trim() || 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=480&h=360&q=70',
      description: F.desc.value.trim(), specs: currentSpecs(),
    };
    try {
      if (editing) {
        db.update('products', editing, data);
        toast(`Producto actualizado: ${data.name}`);
      } else {
        const id = db.nextId('products', 'P', 3);
        db.insert('products', { id, ...data, stock: 0, createdAt: new Date().toISOString() });
        const qty = Math.floor(Number(F.stock.value) || 0);
        if (qty > 0) adjustStock({ productId: id, type: 'Entrada', qty, reason: 'Compra a proveedor', note: 'Stock inicial al crear el producto', user: ctx.user.name });
        toast(`Producto creado: ${data.name}`);
      }
      closeModal(dlg);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  render();
  onDataChange(render);
}

})();
