/* ==========================================================================
   NEXORA ADMIN · reportes.js
   Reportes por rango de fechas, canal, categoría y exportación CSV
   ========================================================================== */
(function () {
  'use strict';

  const D = window.NEXORA_DATA;
  const UI = window.NEXORA_UI;
  if (!D || !UI) {
    console.error('Nexora: falta data-mock.js o layout.js');
    return;
  }

  const { db, onDataChange, isSale, dayKey, addDays, startOfDay, ORDER_STATUSES } = D;
  const {
    initLayout, $, $$, esc, fmt, badge, orderTone,
    areaChart, donut, sparkline, downloadCSV, toast, emptyRow,
  } = UI;

  document.addEventListener('DOMContentLoaded', () => {
    const ctx = initLayout({ module: 'reportes' });
    if (ctx) main(ctx);
  });

  function main(ctx) {
    const today = startOfDay(new Date());
    const state = {
      from: dayKey(addDays(today, -29)),
      to: dayKey(today),
      channel: '',
      range: 30,
    };

    $('#fromDate').value = state.from;
    $('#toDate').value = state.to;

    const filtered = () => db.all('orders')
      .filter((o) => isSale(o)
        && dayKey(o.date) >= state.from
        && dayKey(o.date) <= state.to
        && (!state.channel || o.channel === state.channel))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    function series() {
      if (state.from > state.to) return [];
      const start = startOfDay(new Date(`${state.from}T00:00:00`));
      const end = startOfDay(new Date(`${state.to}T00:00:00`));
      const slots = new Map();
      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        slots.set(dayKey(d), { total: 0, count: 0, date: new Date(d) });
      }
      filtered().forEach((o) => {
        const slot = slots.get(dayKey(o.date));
        if (slot) { slot.total += o.total; slot.count += 1; }
      });
      return [...slots.values()].map((s) => ({
        label: s.date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', ''),
        tooltipLabel: s.date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }),
        value: Math.round(s.total * 100) / 100,
        sub: `${s.count} ${s.count === 1 ? 'venta' : 'ventas'}`,
      }));
    }

    function renderKpis(points) {
      const orders = filtered();
      const sales = orders.reduce((a, o) => a + o.total, 0);
      const units = orders.reduce((a, o) => a + o.items.reduce((x, l) => x + l.qty, 0), 0);
      const avg = orders.length ? sales / orders.length : 0;
      const spark = points.map((p) => p.value);

      $('#reportKpis').innerHTML = `
        <article class="kpi">
          <span class="kpi__icon kpi__icon--indigo"><i class="ph-fill ph-currency-circle-dollar" aria-hidden="true"></i></span>
          <div class="kpi__body"><p>Ingresos del periodo</p><strong>${fmt.money(sales)}</strong><small>${state.from} al ${state.to}</small></div>
          ${sparkline(spark, '#4F46E5')}
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--purple"><i class="ph-fill ph-shopping-bag" aria-hidden="true"></i></span>
          <div class="kpi__body"><p>Ventas registradas</p><strong>${fmt.int(orders.length)}</strong><small>Web y caja</small></div>
          ${sparkline(points.map((p) => Number(p.sub.split(' ')[0])), '#7C3AED')}
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--emerald"><i class="ph-fill ph-receipt" aria-hidden="true"></i></span>
          <div class="kpi__body"><p>Ticket promedio</p><strong>${fmt.money(avg)}</strong><small>Por operación</small></div>
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--amber"><i class="ph-fill ph-package" aria-hidden="true"></i></span>
          <div class="kpi__body"><p>Unidades vendidas</p><strong>${fmt.int(units)}</strong><small>Productos del catálogo</small></div>
        </article>`;
    }

    function renderChart(points) {
      const total = points.reduce((a, p) => a + p.value, 0);
      $('#reportChartSummary').textContent = `${fmt.money(total)} en ${points.length} ${points.length === 1 ? 'día' : 'días'}`;
      areaChart($('#reportChart'), points, { ariaLabel: 'Ventas diarias del periodo seleccionado' });
    }

    function renderDonut() {
      const by = {};
      filtered().forEach((o) => o.items.forEach((l) => {
        const product = db.get('products', l.productId);
        const category = product ? product.category : 'Otros';
        by[category] = (by[category] || 0) + l.qty * l.price;
      }));
      const segments = Object.entries(by)
        .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
        .sort((a, b) => b.value - a.value);
      donut($('#reportDonut'), segments, {
        centerLabel: 'en el periodo',
        ariaLabel: 'Distribución de ventas por categoría',
      });
    }

    function renderTop() {
      const by = {};
      filtered().forEach((o) => o.items.forEach((l) => {
        by[l.productId] = by[l.productId] || { name: l.name, units: 0, sales: 0 };
        by[l.productId].units += l.qty;
        by[l.productId].sales += l.qty * l.price;
      }));
      const top = Object.values(by).sort((a, b) => b.units - a.units).slice(0, 5);
      const max = top[0]?.units || 1;
      $('#reportTop').innerHTML = top.length
        ? top.map((t) => `<li>
            <span class="rank__name" title="${esc(t.name)}">${esc(t.name)}</span>
            <span class="rank__units">${t.units} u.</span>
            <div class="progress progress--primary"><span style="width:${(t.units / max) * 100}%"></span></div>
          </li>`).join('')
        : '<li class="muted">Sin ventas en el periodo.</li>';
    }

    function renderChannels() {
      const orders = filtered();
      const total = orders.reduce((a, o) => a + o.total, 0);
      const rows = [
        ['web', 'Venta web', 'ph-globe'],
        ['caja', 'Venta de caja', 'ph-storefront'],
      ].map(([key, label, icon]) => {
        const list = orders.filter((o) => o.channel === key);
        const value = list.reduce((a, o) => a + o.total, 0);
        const pct = total ? (value / total) * 100 : 0;
        return `<li>
          <div class="summary-list__row"><span><i class="ph ${icon}" aria-hidden="true"></i> ${label}</span><b>${fmt.money(value)}</b></div>
          <div class="progress progress--primary"><span style="width:${pct}%"></span></div>
          <small class="muted">${list.length} operaciones · ${pct.toFixed(1)} %</small>
        </li>`;
      });
      $('#reportChannels').innerHTML = rows.join('');
    }

    function renderStatuses() {
      const orders = filtered();
      const total = orders.length || 1;
      $('#reportStatuses').innerHTML = ORDER_STATUSES.map((status) => {
        const count = orders.filter((o) => o.status === status).length;
        return `<li>
          <div class="summary-list__row"><span>${badge(status, orderTone(status))}</span><b>${fmt.int(count)}</b></div>
          <div class="progress progress--primary"><span style="width:${(count / total) * 100}%"></span></div>
        </li>`;
      }).join('');
    }

    function renderRows() {
      const orders = filtered();
      $('#reportRowsInfo').textContent = `${fmt.int(orders.length)} ${orders.length === 1 ? 'operación' : 'operaciones'} en el filtro`;
      $('#reportRows').innerHTML = orders.length
        ? orders.map((o) => `<tr>
            <td><a class="link" href="pedidos.html?order=${encodeURIComponent(o.id)}">${esc(o.id)}</a></td>
            <td class="muted">${fmt.date(o.date)}</td>
            <td>${esc(o.customer?.name || 'Consumidor final')}</td>
            <td>${badge(o.channel === 'web' ? 'Web' : 'Caja', o.channel === 'web' ? 'primary' : 'neutral')}</td>
            <td>${esc(o.payment || '—')}</td>
            <td>${badge(o.status, orderTone(o.status))}</td>
            <td class="num"><b>${fmt.money(o.total)}</b></td>
          </tr>`).join('')
        : emptyRow(7, 'No hay ventas en el periodo seleccionado', 'ph-chart-line');
    }

    function syncRange() {
      $$('#reportRange button').forEach((b) => {
        b.setAttribute('aria-pressed', String(Number(b.dataset.range) === state.range));
      });
    }

    function render() {
      const points = series();
      renderKpis(points);
      renderChart(points);
      renderDonut();
      renderTop();
      renderChannels();
      renderStatuses();
      renderRows();
      syncRange();
    }

    function exportCSV() {
      if (!ctx.guard('create')) return;
      const orders = filtered();
      if (!orders.length) return toast('No hay datos para exportar en este periodo.', 'warning');
      const headers = ['Pedido', 'Fecha', 'Cliente', 'Canal', 'Pago', 'Estado', 'Subtotal', 'IGV', 'Total'];
      const rows = orders.map((o) => [
        o.id, fmt.date(o.date), o.customer?.name || 'Consumidor final',
        o.channel, o.payment || '', o.status, o.subtotal, o.igv, o.total,
      ]);
      downloadCSV(`nexora-reporte-${state.from}-${state.to}.csv`, headers, rows);
      toast(`${rows.length} filas exportadas correctamente.`, 'success');
    }

    $('#fromDate').addEventListener('change', (e) => { state.from = e.target.value; state.range = 0; render(); });
    $('#toDate').addEventListener('change', (e) => { state.to = e.target.value; state.range = 0; render(); });
    $('#channelFilter').addEventListener('change', (e) => { state.channel = e.target.value; render(); });
    $$('#reportRange button').forEach((b) => b.addEventListener('click', () => {
      const days = Number(b.dataset.range);
      const end = startOfDay(new Date());
      state.range = days;
      state.to = dayKey(end);
      state.from = dayKey(addDays(end, -(days - 1)));
      $('#fromDate').value = state.from;
      $('#toDate').value = state.to;
      render();
    }));
    $('#exportReport').addEventListener('click', exportCSV);
    $('#exportRows').addEventListener('click', exportCSV);

    render();
    onDataChange(render);
  }
})();
