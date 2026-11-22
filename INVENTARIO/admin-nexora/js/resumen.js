(function () {
  'use strict';

  const D = window.NEXORA_DATA;
  const UI = window.NEXORA_UI;
  if (!D || !UI) {
    console.error('Nexora: falta data-mock.js o layout.js');
    return;
  }

  const { db, onDataChange, isSale, stockLevel, promoStatus, dayKey, addDays, startOfDay } = D;
  const { initLayout, $, $$, esc, fmt, badge, orderTone, areaChart, donut, sparkline } = UI;

  let ctx;

  document.addEventListener('DOMContentLoaded', () => {
    ctx = initLayout({ module: 'resumen' });
    if (ctx) main();
  });

/* ==========================================================================
   NEXORA ADMIN · resumen.js
   KPIs dinámicos, gráficos, últimos movimientos y promociones vigentes
   ========================================================================== */
function main() {
  let range = 30;

  const salesOf = (orders) => orders.filter(isSale).reduce((a, o) => a + o.total, 0);

  /** Serie diaria de ventas para los últimos `days` días (incluye hoy). */
  function dailySeries(days) {
    const today = startOfDay(new Date());
    const map = new Map();
    for (let i = days - 1; i >= 0; i--) map.set(dayKey(addDays(today, -i)), { total: 0, count: 0, date: addDays(today, -i) });
    db.all('orders').filter(isSale).forEach((o) => {
      const slot = map.get(dayKey(o.date));
      if (slot) { slot.total += o.total; slot.count += 1; }
    });
    return [...map.values()].map((s) => ({
      label: s.date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', ''),
      tooltipLabel: s.date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }),
      value: Math.round(s.total * 100) / 100,
      sub: `${s.count} ${s.count === 1 ? 'venta' : 'ventas'}`,
    }));
  }

  const deltaPill = (cur, prev) => {
    if (!prev) return '<span class="delta delta--flat">—</span>';
    const pct = ((cur - prev) / prev) * 100;
    const cls = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
    const icon = cls === 'up' ? 'ph-trend-up' : cls === 'down' ? 'ph-trend-down' : 'ph-minus';
    return `<span class="delta delta--${cls}"><i class="ph ${icon}" aria-hidden="true"></i>${fmt.pct(pct)}</span>`;
  };

  function renderKpis() {
    const now = new Date();
    const orders = db.all('orders');
    const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), prevDays), 23, 59, 59);

    const cur = orders.filter((o) => new Date(o.date) >= curStart);
    const prev = orders.filter((o) => { const d = new Date(o.date); return d >= prevStart && d <= prevEnd; });
    const curSales = salesOf(cur), prevSales = salesOf(prev);
    const curCount = cur.filter(isSale).length, prevCount = prev.filter(isSale).length;
    const pending = orders.filter((o) => o.status === 'Pendiente').length;

    const products = db.all('products');
    const stockValue = products.reduce((a, p) => a + p.stock * p.cost, 0);
    const units = products.reduce((a, p) => a + p.stock, 0);
    const active = products.filter((p) => p.status === 'Activo');
    const critical = active.filter((p) => ['out', 'critical'].includes(stockLevel(p).key)).length;
    const low = active.filter((p) => stockLevel(p).key === 'low').length;
    const out = active.filter((p) => p.stock <= 0).length;

    const spark = dailySeries(14).map((p) => p.value);
    const monthName = now.toLocaleDateString('es-PE', { month: 'long' });

    $('#kpis').innerHTML = `
      <article class="kpi">
        <span class="kpi__icon kpi__icon--indigo"><i class="ph-fill ph-currency-circle-dollar" aria-hidden="true"></i></span>
        <div class="kpi__body"><p>Ventas de ${esc(monthName)}</p><strong>${fmt.money(curSales)}</strong><small>${deltaPill(curSales, prevSales)} vs. mes anterior</small></div>
        ${sparkline(spark, '#4F46E5')}
      </article>
      <article class="kpi">
        <span class="kpi__icon kpi__icon--purple"><i class="ph-fill ph-shopping-bag" aria-hidden="true"></i></span>
        <div class="kpi__body"><p>Pedidos del mes</p><strong>${fmt.int(curCount)}</strong><small>${deltaPill(curCount, prevCount)} · ${pending} por atender</small></div>
        ${sparkline(dailySeries(14).map((p) => Number(p.sub.split(' ')[0])), '#7C3AED')}
      </article>
      <article class="kpi">
        <span class="kpi__icon kpi__icon--emerald"><i class="ph-fill ph-warehouse" aria-hidden="true"></i></span>
        <div class="kpi__body"><p>Valor del inventario</p><strong>${fmt.money(stockValue)}</strong><small>${fmt.int(units)} unidades · ${products.length} SKU</small></div>
      </article>
      <article class="kpi">
        <span class="kpi__icon kpi__icon--amber"><i class="ph-fill ph-warning-octagon" aria-hidden="true"></i></span>
        <div class="kpi__body"><p>Alertas de stock</p><strong>${critical + low}</strong>
          <small>${critical ? badge(`${critical} crítico${critical > 1 ? 's' : ''}`, 'danger') : ''}${low ? badge(`${low} bajo${low > 1 ? 's' : ''}`, 'warning') : ''}${out ? `· ${out} agotado${out > 1 ? 's' : ''}` : ''}${!critical && !low ? 'Todo en orden' : ''}</small></div>
      </article>`;
  }

  function renderChart() {
    const series = dailySeries(range);
    const total = series.reduce((a, p) => a + p.value, 0);
    $('#chartSummary').textContent = `${fmt.money(total)} en los últimos ${range} días`;
    areaChart($('#salesChart'), series, { ariaLabel: `Ventas diarias de los últimos ${range} días` });
    $$('#rangeSwitch button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === range)));
  }

  function renderCategories() {
    const from = addDays(startOfDay(new Date()), -29);
    const by = {};
    db.all('orders').filter((o) => isSale(o) && new Date(o.date) >= from).forEach((o) => {
      o.items.forEach((l) => {
        const p = db.get('products', l.productId);
        const cat = p ? p.category : 'Otros';
        by[cat] = (by[cat] || 0) + l.qty * l.price;
      });
    });
    const segments = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    donut($('#catDonut'), segments, { centerLabel: 'en 30 días', ariaLabel: 'Ventas por categoría' });
  }

  function renderTop() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const by = {};
    db.all('orders').filter((o) => isSale(o) && new Date(o.date) >= start).forEach((o) => o.items.forEach((l) => {
      by[l.productId] = by[l.productId] || { name: l.name, units: 0 };
      by[l.productId].units += l.qty;
    }));
    const top = Object.values(by).sort((a, b) => b.units - a.units).slice(0, 5);
    const max = top[0]?.units || 1;
    $('#topProducts').innerHTML = top.length
      ? top.map((t) => `<li><span class="rank__name" title="${esc(t.name)}">${esc(t.name)}</span><span class="rank__units">${t.units} u.</span><div class="progress progress--primary"><span style="width:${(t.units / max) * 100}%"></span></div></li>`).join('')
      : '<li class="muted">Aún no hay ventas este mes.</li>';
  }

  function renderMovements() {
    const last = [...db.all('movements')].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 7);
    const meta = { Entrada: ['in', 'ph-arrow-down-left'], Salida: ['out', 'ph-arrow-up-right'], Ajuste: ['adj', 'ph-arrows-left-right'] };
    $('#lastMovements').innerHTML = last.map((m) => {
      const [k, icon] = meta[m.type];
      const sign = m.delta > 0 ? '+' : m.delta < 0 ? '−' : '±';
      return `<li><span class="feed__icon feed__icon--${k}"><i class="ph-fill ${icon}" aria-hidden="true"></i></span>
        <span class="feed__text"><b title="${esc(m.productName)}">${esc(m.productName)}</b><small>${esc(m.reason)} · ${fmt.relative(m.date)}</small></span>
        <span class="feed__qty feed__qty--${k === 'adj' ? '' : k}">${sign}${Math.abs(m.delta)}</span></li>`;
    }).join('') || '<li class="muted">Sin movimientos.</li>';
  }

  function renderPromos() {
    const today = startOfDay(new Date());
    const list = db.all('promotions').filter((p) => promoStatus(p) === 'Vigente');
    $('#activePromos').innerHTML = list.length ? list.map((p) => {
      const left = Math.ceil((new Date(`${p.endDate}T00:00:00`) - today) / 864e5);
      const off = p.type === 'percent' ? `-${p.value}%` : `-S/ ${p.value}`;
      const scope = p.scope === 'all' ? 'Toda la tienda' : p.scope === 'category' ? p.category : `${p.productIds.length} producto(s)`;
      return `<li><span class="promo-list__off">${off}</span><span class="promo-list__info"><b>${esc(p.name)}</b><small>${esc(scope)} · ${left <= 0 ? 'vence hoy' : `vence en ${left} ${left === 1 ? 'día' : 'días'}`}${p.code ? ` · cupón ${esc(p.code)}` : ''}</small></span></li>`;
    }).join('') : '<li class="muted">No hay promociones vigentes.</li>';
  }

  function renderRecent() {
    const last = [...db.all('orders')].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
    $('#recentOrders').innerHTML = last.map((o) => `
      <tr>
        <td><a class="link" href="pedidos.html?order=${encodeURIComponent(o.id)}">${esc(o.id)}</a></td>
        <td>${esc(o.customer.name)}</td>
        <td>${badge(o.channel === 'web' ? 'Web' : 'Caja', o.channel === 'web' ? 'primary' : 'neutral', o.channel === 'web' ? 'ph-globe' : 'ph-storefront')}</td>
        <td class="muted">${fmt.relative(o.date)}</td>
        <td class="num"><b>${fmt.money(o.total)}</b></td>
        <td>${badge(o.status, orderTone(o.status))}</td>
      </tr>`).join('');
  }

  function render() {
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    $('#greeting').textContent = `${hello}, ${ctx.user.name.split(' ')[0]}. Así va Nexora hoy.`;
    renderKpis();
    renderChart();
    renderCategories();
    renderTop();
    renderMovements();
    renderPromos();
    renderRecent();
  }

  $('#rangeSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    range = Number(b.dataset.range);
    renderChart();
  });

  render();
  onDataChange(render);   // sincronización en tiempo real con los demás módulos
}

})();
