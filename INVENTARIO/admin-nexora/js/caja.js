/* ==========================================================================
   NEXORA ADMIN · caja.js
   Punto de venta: catálogo, carrito, cupones y registro de ventas en caja
   ========================================================================== */
(function () {
  'use strict';

  const D = window.NEXORA_DATA;
  const UI = window.NEXORA_UI;
  if (!D || !UI) {
    console.error('Nexora: falta data-mock.js o layout.js');
    return;
  }

  const {
    db, onDataChange, getSessionUser, createOrder, bestPromo, findCoupon,
    promoStatus, CATEGORIES, PAYMENT_METHODS,
  } = D;
  const { initLayout, $, esc, fmt, badge, toast, debounce, orderTone } = UI;

  document.addEventListener('DOMContentLoaded', () => {
    const ctx = initLayout({ module: 'caja' });
    if (ctx) main(ctx);
  });

  function main(ctx) {
    const cart = new Map();
    const state = { q: '', cat: '', coupon: '' };
    const cashier = (ctx.user || getSessionUser() || {}).name || 'Sistema';

    $('#cashierGreeting').textContent = `Punto de venta · ${cashier.split(' ')[0]}`;
    $('#posCategory').innerHTML = '<option value="">Todas las categorías</option>'
      + CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('#paymentMethod').innerHTML = PAYMENT_METHODS.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');

    const activeProducts = () => db.all('products').filter((p) => p.status === 'Activo' && p.stock > 0);

    /** Precio final del producto considerando promociones vigentes y cupón. */
    function unitPrice(product) {
      const best = bestPromo(product, { code: state.coupon });
      const price = best ? Math.max(0, product.price - best.discount) : product.price;
      return {
        price: Math.round(price * 100) / 100,
        discount: Math.round((product.price - price) * 100) / 100,
        promoId: best ? best.promo.id : null,
        promoName: best ? best.promo.name : '',
      };
    }

    function catalogProducts() {
      const q = UI.norm(state.q);
      return activeProducts().filter((p) =>
        (!state.cat || p.category === state.cat)
        && (!q || UI.norm(`${p.name} ${p.sku} ${p.brand} ${p.category}`).includes(q)));
    }

    function renderCatalog() {
      const list = catalogProducts();
      $('#posCatalog').innerHTML = list.length
        ? list.map((p) => {
          const price = unitPrice(p);
          return `<article class="pos-product">
            <img class="pos-product__img" src="${esc(p.image)}" alt="" loading="lazy">
            <div class="pos-product__name" title="${esc(p.name)}">${esc(p.name)}</div>
            <div class="pos-product__meta">
              <span class="muted">${esc(p.brand)} · ${esc(p.category)}</span>
              ${price.promoId ? badge('Promo', 'success') : badge(`${p.stock} u.`, 'neutral')}
            </div>
            <div class="pos-product__meta">
              <b class="pos-product__price">${fmt.money(price.price)}</b>
              ${price.discount ? `<small class="muted">${fmt.money(p.price)}</small>` : '<span class="muted">SKU ' + esc(p.sku) + '</span>'}
            </div>
            <button type="button" class="btn btn--soft btn--sm btn--block" data-add="${esc(p.id)}">
              <i class="ph ph-plus" aria-hidden="true"></i> Agregar
            </button>
          </article>`;
        }).join('')
        : '<div class="empty"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><p>No hay productos para los filtros actuales.</p></div>';
    }

    function cartLines() {
      return [...cart.entries()].map(([id, qty]) => {
        const product = db.get('products', id);
        if (!product || product.stock <= 0) return null;
        const price = unitPrice(product);
        return {
          product, qty,
          price: price.price,
          discount: price.discount,
          promoId: price.promoId,
          promoName: price.promoName,
          subtotal: Math.round(price.price * qty * 100) / 100,
        };
      }).filter(Boolean);
    }

    function renderCart() {
      const lines = cartLines();
      const units = lines.reduce((a, l) => a + l.qty, 0);
      $('#cartCount').textContent = `${units} ${units === 1 ? 'producto' : 'productos'}`;
      $('#posCart').innerHTML = lines.length
        ? lines.map((l) => `<div class="cart-line">
            <span class="cart-line__name" title="${esc(l.product.name)}">${esc(l.product.name)}</span>
            <span class="cart-line__price">${fmt.money(l.subtotal)}</span>
            <span class="cart-line__sub">${esc(l.product.sku)}${l.promoName ? ' · ' + esc(l.promoName) : ''}</span>
            <span class="cart-line__sub">${fmt.money(l.price)} c/u</span>
            <div class="cart-line__actions">
              <span class="qty">
                <button type="button" data-dec="${esc(l.product.id)}" aria-label="Quitar una unidad">−</button>
                <span>${l.qty}</span>
                <button type="button" data-inc="${esc(l.product.id)}" aria-label="Agregar una unidad">+</button>
              </span>
              <button type="button" class="cart-line__remove" data-del="${esc(l.product.id)}">Eliminar</button>
            </div>
          </div>`).join('')
        : '<div class="pos-empty"><i class="ph ph-shopping-cart" aria-hidden="true"></i><p>Agrega productos del catálogo para iniciar la venta.</p></div>';

      const total = Math.round(lines.reduce((a, l) => a + l.subtotal, 0) * 100) / 100;
      const subtotal = Math.round(total / 1.18 * 100) / 100;
      const igv = Math.round((total - subtotal) * 100) / 100;
      $('#posTotals').innerHTML = `
        <div><span>Subtotal (sin IGV)</span><b>${fmt.money(subtotal)}</b></div>
        <div><span>IGV (18 %)</span><b>${fmt.money(igv)}</b></div>
        <div class="grand"><span>Total a pagar</span><b>${fmt.money(total)}</b></div>`;
      $('#payBtn').disabled = !lines.length;
    }

    function renderSales() {
      const last = db.all('orders')
        .filter((o) => o.channel === 'caja')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 8);
      $('#lastCashSales').innerHTML = last.length
        ? last.map((o) => `<tr>
            <td><a class="link" href="pedidos.html?order=${encodeURIComponent(o.id)}">${esc(o.id)}</a></td>
            <td>${esc(o.customer?.name || 'Consumidor final')}</td>
            <td class="muted">${fmt.dateTime(o.date)}</td>
            <td>${esc(o.payment || '—')}</td>
            <td class="num"><b>${fmt.money(o.total)}</b></td>
            <td>${badge(o.status, orderTone(o.status))}</td>
          </tr>`).join('')
        : `<tr class="table__empty"><td colspan="6"><div class="empty"><i class="ph ph-receipt" aria-hidden="true"></i><p>Aún no hay ventas de caja registradas.</p></div></td></tr>`;
    }

    function render() {
      renderCatalog();
      renderCart();
      renderSales();
    }

    $('#posSearch').addEventListener('input', debounce((e) => { state.q = e.target.value; renderCatalog(); }, 150));
    $('#posCategory').addEventListener('change', (e) => { state.cat = e.target.value; renderCatalog(); });
    $('#couponCode').addEventListener('input', debounce((e) => {
      state.coupon = e.target.value.trim().toUpperCase();
      renderCatalog();
      renderCart();
    }, 200));

    $('#posCatalog').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      const product = db.get('products', btn.dataset.add);
      if (!product || product.stock <= 0) return toast('Producto sin stock disponible.', 'error');
      const next = (cart.get(product.id) || 0) + 1;
      if (next > product.stock) return toast(`Stock máximo disponible: ${product.stock}.`, 'warning');
      cart.set(product.id, next);
      renderCart();
    });

    $('#posCart').addEventListener('click', (e) => {
      const inc = e.target.closest('[data-inc]');
      const dec = e.target.closest('[data-dec]');
      const del = e.target.closest('[data-del]');
      const id = inc?.dataset.inc || dec?.dataset.dec || del?.dataset.del;
      if (!id) return;
      const product = db.get('products', id);
      const current = cart.get(id) || 0;
      if (del) cart.delete(id);
      else if (dec) current <= 1 ? cart.delete(id) : cart.set(id, current - 1);
      else if (inc && product && current < product.stock) cart.set(id, current + 1);
      else if (inc) return toast('No hay más stock disponible.', 'warning');
      renderCart();
    });

    $('#clearCart').addEventListener('click', () => { cart.clear(); renderCart(); });

    $('#checkoutForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!ctx.guard('create')) return;
      const lines = cartLines();
      if (!lines.length) return toast('El carrito está vacío.', 'error');

      const code = $('#couponCode').value.trim().toUpperCase();
      if (code) {
        const coupon = findCoupon(code);
        if (!coupon) return toast('El cupón ingresado no existe.', 'error');
        if (promoStatus(coupon) !== 'Vigente') return toast('Ese cupón no está vigente.', 'error');
      }

      const name = $('#customerName').value.trim() || 'Consumidor final';
      const order = createOrder({
        channel: 'caja',
        customer: { name, email: '', phone: '' },
        items: lines.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
          discount: l.discount,
          promoId: l.promoId,
        })),
        payment: $('#paymentMethod').value,
        status: 'Entregado',
        cashier,
        couponCode: code,
      });

      cart.clear();
      $('#customerName').value = '';
      $('#couponCode').value = '';
      state.coupon = '';
      render();
      toast(`Venta ${order.id} registrada · ${fmt.money(order.total)}`, 'success');
    });

    render();
    onDataChange(() => { renderCatalog(); renderCart(); renderSales(); });
  }
})();
