/* ==========================================================================
   NEXORA ADMIN · layout.js
   Lógica compartida: sidebar, sesión, permisos, notificaciones, utilidades
   de moneda (S/), modales, toasts, paginación, gráficos SVG y exportación CSV.
   ========================================================================== */
import {
  db, MODULES, getSessionUser, setSessionUser, hasPermission, stockLevel,
  promoStatus, onDataChange, dayKey, addDays, startOfDay,
} from './data-mock.js';

/* ---------------------------------------------------------------------------
   Utilidades generales
   --------------------------------------------------------------------------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const moneyFmt = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('es-PE');
export const fmt = {
  /** Moneda en Soles peruanos: S/ 1,234.50 */
  money: (n) => moneyFmt.format(Number(n) || 0),
  int: (n) => intFmt.format(Number(n) || 0),
  compact: (n) => (n >= 1000000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(Math.round(n))),
  date: (iso) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
  time: (iso) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }),
  dateTime: (iso) => `${fmt.date(iso)} · ${fmt.time(iso)}`,
  pct: (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`,
  relative(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return d < 30 ? `hace ${d} ${d === 1 ? 'día' : 'días'}` : fmt.date(iso);
  },
};

export const PALETTE = ['#4F46E5', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E', '#64748B'];

const ORDER_TONES = { Pendiente: 'warning', Procesando: 'info', Enviado: 'purple', Entregado: 'success', Cancelado: 'danger' };
export const orderTone = (status) => ORDER_TONES[status] || 'neutral';

/** Badge tipo píldora. */
export const badge = (text, tone = 'neutral', icon = '') =>
  `<span class="badge badge--${tone}">${icon ? `<i class="ph-fill ${icon}" aria-hidden="true"></i>` : ''}${esc(text)}</span>`;

const AVATAR_COLORS = ['#4F46E5', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E', '#14B8A6'];
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export function avatar(name, size = '') {
  const code = [...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `<span class="avatar ${size}" style="--av:${AVATAR_COLORS[code % AVATAR_COLORS.length]}" aria-hidden="true">${esc(initials(name))}</span>`;
}

/** Fila de tabla para estados vacíos. */
export const emptyRow = (cols, msg = 'Sin resultados', icon = 'ph-magnifying-glass') =>
  `<tr class="table__empty"><td colspan="${cols}"><div class="empty"><i class="ph ${icon}" aria-hidden="true"></i><p>${esc(msg)}</p></div></td></tr>`;

/* Imagen de respaldo si Unsplash falla */
const FALLBACK_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><rect width="480" height="360" fill="#EEF0FF"/><rect x="190" y="140" width="100" height="70" rx="8" fill="none" stroke="#A5B4FC" stroke-width="6"/></svg>');
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t instanceof HTMLImageElement && t.src !== FALLBACK_IMG) t.src = FALLBACK_IMG;
}, true);

/* ---------------------------------------------------------------------------
   CSV
   --------------------------------------------------------------------------- */
export function downloadCSV(filename, headers, rows) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`; // evita inyección de fórmulas en Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ---------------------------------------------------------------------------
   Toasts (popover para verse por encima de los modales)
   --------------------------------------------------------------------------- */
export function toast(message, type = 'success') {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.className = 'toasts';
    host.setAttribute('popover', 'manual');
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const icons = { success: 'ph-check-circle', error: 'ph-warning-circle', info: 'ph-info', warning: 'ph-warning' };
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<i class="ph-fill ${icons[type] || icons.info}" aria-hidden="true"></i><span></span>`;
  el.lastElementChild.textContent = message;
  host.append(el);
  if (host.showPopover) {
    if (host.matches(':popover-open')) host.hidePopover();
    host.showPopover();
  }
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 400); }, type === 'error' ? 5000 : 3200);
}

/* ---------------------------------------------------------------------------
   Modales (<dialog> nativo)
   --------------------------------------------------------------------------- */
export const openModal = (dlg) => { if (dlg && !dlg.open) dlg.showModal(); };
export const closeModal = (dlg) => { if (dlg && dlg.open) dlg.close(); };

document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) closer.closest('dialog')?.close();
});

// "Light dismiss" para diálogos informativos (data-lightdismiss)
(() => {
  let down = false;
  const outside = (e, d) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  document.addEventListener('pointerdown', (e) => { const d = e.target; down = d instanceof HTMLDialogElement && d.hasAttribute('data-lightdismiss') && outside(e, d); });
  document.addEventListener('pointerup', (e) => { const d = e.target; if (down && d instanceof HTMLDialogElement && outside(e, d)) d.close(); down = false; });
})();

/** Confirmación accesible. Devuelve Promise<boolean>. */
export function confirmDialog({ title = '¿Confirmar acción?', message = '', confirmText = 'Confirmar', danger = false, icon } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal modal--sm';
    dlg.setAttribute('aria-labelledby', 'cfmTitle');
    dlg.innerHTML = `
      <form method="dialog" class="modal__form">
        <div class="confirm">
          <span class="confirm__icon confirm__icon--${danger ? 'danger' : 'primary'}"><i class="ph-fill ${icon || (danger ? 'ph-warning' : 'ph-question')}" aria-hidden="true"></i></span>
          <h2 id="cfmTitle">${esc(title)}</h2>
          <p>${esc(message)}</p>
        </div>
        <div class="modal__foot modal__foot--center">
          <button value="cancel" class="btn btn--ghost" autofocus>Cancelar</button>
          <button value="ok" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(confirmText)}</button>
        </div>
      </form>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    dlg.showModal();
  });
}

/* ---------------------------------------------------------------------------
   Paginación
   --------------------------------------------------------------------------- */
export function renderPager(el, { page, pageSize, total, onChange, noun = 'registros' }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const info = `<span class="pager__info">${from}–${to} de ${fmt.int(total)} ${noun}</span>`;
  if (pages <= 1) { el.innerHTML = info; return; }
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  el.innerHTML = `${info}
    <div class="pager__buttons">
      <button type="button" class="btn btn--ghost btn--sm btn--icon" data-p="${page - 1}" aria-label="Página anterior" ${page === 1 ? 'disabled' : ''}><i class="ph ph-caret-left" aria-hidden="true"></i></button>
      ${nums.map((n) => `<button type="button" class="btn btn--sm ${n === page ? 'btn--primary' : 'btn--ghost'}" data-p="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`).join('')}
      <button type="button" class="btn btn--ghost btn--sm btn--icon" data-p="${page + 1}" aria-label="Página siguiente" ${page === pages ? 'disabled' : ''}><i class="ph ph-caret-right" aria-hidden="true"></i></button>
    </div>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (b && !b.disabled) onChange(Number(b.dataset.p));
  };
}

/* ---------------------------------------------------------------------------
   Gráficos SVG ligeros (sin dependencias)
   --------------------------------------------------------------------------- */
function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const m = v / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
}

/** Gráfico de área suavizado con tooltip. points: [{label, value, sub}] */
export function areaChart(el, points, { format = fmt.money, ariaLabel = 'Gráfico de ventas' } = {}) {
  if (!points.length) { el.innerHTML = '<div class="empty"><i class="ph ph-chart-line" aria-hidden="true"></i><p>Sin datos en este periodo</p></div>'; return; }
  const W = 760, H = 270, pl = 54, pr = 14, pt = 14, pb = 30;
  const max = niceMax(Math.max(...points.map((p) => p.value), 1));
  const n = points.length;
  const step = n > 1 ? (W - pl - pr) / (n - 1) : 0;
  const x = (i) => (n > 1 ? pl + i * step : (W + pl - pr) / 2);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  let line = `M${x(0)},${y(points[0].value)}`;
  for (let i = 1; i < n; i++) { const mx = (x(i - 1) + x(i)) / 2; line += ` C${mx},${y(points[i - 1].value)} ${mx},${y(points[i].value)} ${x(i)},${y(points[i].value)}`; }
  const area = `${line} L${x(n - 1)},${H - pb} L${x(0)},${H - pb} Z`;
  const gid = `g${Math.random().toString(36).slice(2, 8)}`;
  const every = Math.ceil(n / 8);
  const grid = [0, 1, 2, 3, 4].map((t) => {
    const val = (max * t) / 4;
    return `<line x1="${pl}" x2="${W - pr}" y1="${y(val)}" y2="${y(val)}" class="chart__grid"/><text x="${pl - 8}" y="${y(val) + 4}" text-anchor="end" class="chart__ytick">${fmt.compact(val)}</text>`;
  }).join('');
  const xt = points.map((p, i) => (i % every === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="chart__xtick">${esc(p.label)}</text>` : '')).join('');

  el.classList.add('chart');
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4F46E5" stop-opacity=".28"/><stop offset="1" stop-color="#7C3AED" stop-opacity="0"/></linearGradient>
      <linearGradient id="${gid}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4F46E5"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs>
      ${grid}${xt}
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${line}" fill="none" stroke="url(#${gid}s)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <line class="chart__guide" y1="${pt}" y2="${H - pb}" x1="0" x2="0" visibility="hidden"/>
      <circle class="chart__dot" r="5.5" visibility="hidden"/>
    </svg>
    <div class="chart__tip" hidden></div>`;

  const svg = $('svg', el), tip = $('.chart__tip', el), guide = $('.chart__guide', svg), dot = $('.chart__dot', svg);
  const show = (i) => {
    const p = points[i];
    guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.value));
    guide.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible'); tip.hidden = false;
    tip.innerHTML = `<b>${esc(format(p.value))}</b><span>${esc(p.tooltipLabel || p.label)}</span>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}`;
    const left = (x(i) / W) * 100;
    tip.style.left = `${Math.min(88, Math.max(12, left))}%`;
    tip.style.top = `${(y(p.value) / H) * 100}%`;
  };
  const hide = () => { guide.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    show(n > 1 ? Math.min(n - 1, Math.max(0, Math.round((vx - pl) / step))) : 0);
  });
  svg.addEventListener('pointerleave', hide);
}

/** Dona con leyenda. segments: [{label, value, color?}] */
export function donut(el, segments, { format = fmt.money, centerLabel = 'Total', ariaLabel = 'Distribución' } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) { el.innerHTML = '<div class="empty"><i class="ph ph-chart-donut" aria-hidden="true"></i><p>Sin datos en este periodo</p></div>'; return; }
  let acc = 0;
  const rings = segments.map((s, i) => {
    const pct = (s.value / total) * 100;
    const out = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${s.color || PALETTE[i % PALETTE.length]}" stroke-width="5.2" stroke-dasharray="${Math.max(0, pct - 0.8)} ${100 - Math.max(0, pct - 0.8)}" stroke-dashoffset="${25 - acc}"><title>${esc(s.label)}: ${esc(format(s.value))}</title></circle>`;
    acc += pct;
    return out;
  }).join('');
  el.innerHTML = `
    <div class="donut">
      <div class="donut__ring">
        <svg viewBox="0 0 42 42" role="img" aria-label="${esc(ariaLabel)}"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#EEF0FF" stroke-width="5.2"/>${rings}</svg>
        <div class="donut__center"><b>${esc(format(total))}</b><span>${esc(centerLabel)}</span></div>
      </div>
      <ul class="legend">
        ${segments.map((s, i) => `<li><span class="legend__dot" style="background:${s.color || PALETTE[i % PALETTE.length]}"></span><span class="legend__label">${esc(s.label)}</span><b>${((s.value / total) * 100).toFixed(0)}%</b></li>`).join('')}
      </ul>
    </div>`;
}

/** Mini gráfico de tendencia para KPIs. */
export function sparkline(values, color = '#4F46E5') {
  const w = 96, h = 32;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------------------------------------------------------------------------
   Sesión, permisos y estructura (sidebar + topbar)
   --------------------------------------------------------------------------- */
let ctx = null;

/** Aplica data-perm="modulo:accion" (o solo "accion" para el módulo actual). */
export function applyPermissions(root = document) {
  if (!ctx) return;
  $$('[data-perm]', root).forEach((el) => {
    const [a, b] = el.dataset.perm.split(':');
    const allowed = b ? ctx.can(b, a) : ctx.can(a);
    el.hidden = !allowed;
  });
}

function buildNotifications() {
  const out = [];
  const can = (m) => ctx.can('view', m);
  const products = db.all('products').filter((p) => p.status === 'Activo');
  if (can('inventario')) {
    const crit = products.filter((p) => ['out', 'critical'].includes(stockLevel(p).key));
    const low = products.filter((p) => stockLevel(p).key === 'low');
    if (crit.length) out.push({ icon: 'ph-warning-octagon', tone: 'danger', title: `${crit.length} ${crit.length === 1 ? 'producto' : 'productos'} en stock crítico`, text: crit.slice(0, 2).map((p) => p.name).join(', ') + (crit.length > 2 ? '…' : ''), href: 'inventario.html#alertas' });
    if (low.length) out.push({ icon: 'ph-warning', tone: 'warning', title: `${low.length} con stock bajo`, text: low.slice(0, 2).map((p) => p.name).join(', ') + (low.length > 2 ? '…' : ''), href: 'inventario.html#alertas' });
  }
  if (can('pedidos')) {
    const pend = db.all('orders').filter((o) => o.status === 'Pendiente').length;
    if (pend) out.push({ icon: 'ph-package', tone: 'info', title: `${pend} ${pend === 1 ? 'pedido pendiente' : 'pedidos pendientes'}`, text: 'Esperan ser procesados.', href: 'pedidos.html?status=Pendiente' });
  }
  if (can('promociones')) {
    const limit = dayKey(addDays(new Date(), 3));
    const ending = db.all('promotions').filter((p) => promoStatus(p) === 'Vigente' && p.endDate <= limit);
    if (ending.length) out.push({ icon: 'ph-timer', tone: 'purple', title: `${ending.length} ${ending.length === 1 ? 'promoción vence' : 'promociones vencen'} pronto`, text: ending.map((p) => p.name).join(', '), href: 'promociones.html' });
  }
  return out;
}

function refreshChrome() {
  if (!ctx) return;
  const pend = db.all('orders').filter((o) => o.status === 'Pendiente').length;
  $$('.nav__badge').forEach((b) => { b.textContent = pend; b.hidden = !pend; });
  const list = $('#notifList');
  if (list) {
    const items = buildNotifications();
    list.innerHTML = items.length
      ? items.map((n) => `<li><a href="${n.href}" class="notif__item"><span class="notif__icon notif__icon--${n.tone}"><i class="ph-fill ${n.icon}" aria-hidden="true"></i></span><span><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span></a></li>`).join('')
      : '<li class="notif__none"><i class="ph ph-check-circle" aria-hidden="true"></i> Todo en orden por ahora</li>';
    const dot = $('#bellDot');
    if (dot) { dot.textContent = items.length; dot.hidden = !items.length; }
  }
}

function renderSidebar() {
  const { user, role, module } = ctx;
  const groups = [];
  MODULES.filter((m) => ctx.can('view', m.key)).forEach((m) => {
    let g = groups.find((x) => x.name === m.group);
    if (!g) groups.push((g = { name: m.group, items: [] }));
    g.items.push(m);
  });
  const staff = db.all('users').filter((u) => u.type === 'Personal' && u.status === 'Activo');

  $('#sidebar').innerHTML = `
    <a class="brand" href="resumen.html" aria-label="Nexora Admin, ir al resumen">
      <span class="brand__mark"><i class="ph-fill ph-cpu" aria-hidden="true"></i></span>
      <span class="brand__text"><b>Nexora</b><small>Panel de administración</small></span>
    </a>
    <nav class="nav" aria-label="Módulos">
      ${groups.map((g) => `
        <p class="nav__label">${esc(g.name)}</p>
        <ul>${g.items.map((m) => `
          <li><a class="nav__link" href="${m.href}" ${m.key === module ? 'aria-current="page"' : ''}>
            <i class="ph ${m.icon}" aria-hidden="true"></i><span>${esc(m.label)}</span>
            ${m.key === 'pedidos' ? '<span class="nav__badge" hidden>0</span>' : ''}
          </a></li>`).join('')}
        </ul>`).join('')}
    </nav>
    <div class="sidebar__foot">
      <button type="button" class="user-chip" id="userChip" aria-haspopup="true" aria-expanded="false" aria-controls="userMenu">
        ${avatar(user.name)}
        <span class="user-chip__info"><b>${esc(user.name)}</b><small>${esc(role?.name || 'Sin rol')}</small></span>
        <i class="ph ph-caret-up-down" aria-hidden="true"></i>
      </button>
      <div class="user-menu dropdown-panel" id="userMenu" hidden>
        <p class="user-menu__title">Cambiar de usuario (demo)</p>
        <ul>${staff.map((u) => `
          <li><button type="button" class="user-menu__item" data-switch="${u.id}" ${u.id === user.id ? 'aria-current="true"' : ''}>
            ${avatar(u.name, 'avatar--sm')}<span><b>${esc(u.name)}</b><small>${esc(db.get('roles', u.roleId)?.name || '')}</small></span>
            ${u.id === user.id ? '<i class="ph-fill ph-check-circle" aria-hidden="true"></i>' : ''}
          </button></li>`).join('')}
        </ul>
        <button type="button" class="user-menu__reset" id="resetDemo"><i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i> Restablecer datos demo</button>
      </div>
    </div>`;
}

function renderTopbar() {
  const meta = MODULES.find((m) => m.key === ctx.module);
  const today = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#topbar').innerHTML = `
    <button type="button" class="icon-btn burger" id="burger" aria-label="Abrir menú" aria-expanded="false"><i class="ph ph-list" aria-hidden="true"></i></button>
    <p class="crumb"><span>${esc(meta?.group || 'Nexora')}</span><i class="ph ph-caret-right" aria-hidden="true"></i><b>${esc(meta?.label || '')}</b></p>
    <div class="topbar__right">
      <span class="topbar__date"><i class="ph ph-calendar-blank" aria-hidden="true"></i> ${esc(today)}</span>
      <div class="dropdown">
        <button type="button" class="icon-btn" id="bellBtn" aria-label="Notificaciones" aria-haspopup="true" aria-expanded="false" aria-controls="notifPanel">
          <i class="ph ph-bell" aria-hidden="true"></i><span class="icon-btn__badge" id="bellDot" hidden>0</span>
        </button>
        <div class="notif dropdown-panel" id="notifPanel" hidden>
          <p class="notif__head">Notificaciones</p>
          <ul id="notifList"></ul>
        </div>
      </div>
    </div>`;
}

function renderDenied() {
  const first = MODULES.find((m) => ctx.can('view', m.key));
  const meta = MODULES.find((m) => m.key === ctx.module);
  $('#content').innerHTML = `
    <div class="denied">
      <span class="denied__icon"><i class="ph-fill ph-lock-key" aria-hidden="true"></i></span>
      <h1>Acceso restringido</h1>
      <p>Tu rol <b>${esc(ctx.role?.name || 'sin rol')}</b> no tiene permiso para ver el módulo <b>${esc(meta?.label || '')}</b>.</p>
      ${first ? `<a class="btn btn--primary" href="${first.href}"><i class="ph ph-arrow-left" aria-hidden="true"></i> Ir a ${esc(first.label)}</a>` : ''}
    </div>`;
}

function bindChrome() {
  const closeAll = () => {
    $$('.dropdown-panel').forEach((p) => { p.hidden = true; });
    $('#userChip')?.setAttribute('aria-expanded', 'false');
    $('#bellBtn')?.setAttribute('aria-expanded', 'false');
  };
  const toggle = (btn, panel) => {
    const open = panel.hidden;
    closeAll();
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  $('#userChip').addEventListener('click', () => toggle($('#userChip'), $('#userMenu')));
  $('#bellBtn').addEventListener('click', () => toggle($('#bellBtn'), $('#notifPanel')));
  document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown') && !e.target.closest('.sidebar__foot')) closeAll(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); document.body.classList.remove('nav-open'); } });

  $('#sidebar').addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-switch]');
    if (sw) { setSessionUser(sw.dataset.switch); location.reload(); return; }
    if (e.target.closest('#resetDemo')) {
      closeAll();
      const ok = await confirmDialog({ title: 'Restablecer datos demo', message: 'Se borrarán todos los cambios y se regenerarán los datos de ejemplo en todos los módulos.', confirmText: 'Restablecer', danger: true });
      if (ok) { db.reset(); location.reload(); }
    }
    if (e.target.closest('.nav__link')) document.body.classList.remove('nav-open');
  });

  // Menú móvil
  const burger = $('#burger');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  document.body.append(scrim);
  burger.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    burger.setAttribute('aria-expanded', String(open));
  });
  scrim.addEventListener('click', () => document.body.classList.remove('nav-open'));
}

/**
 * Inicializa la estructura común. Devuelve el contexto de sesión o `null`
 * si el usuario no tiene permiso para ver el módulo.
 */
export function initLayout({ module }) {
  const user = getSessionUser();
  const role = user ? db.get('roles', user.roleId) : null;
  const can = (action, mod = module) => !!user && hasPermission(user.roleId, mod, action);
  ctx = {
    user, role, module, can,
    /** Verifica un permiso y avisa al usuario si no lo tiene. */
    guard(action, msg) {
      if (can(action)) return true;
      toast(msg || 'Tu rol no tiene permiso para realizar esta acción.', 'error');
      return false;
    },
  };
  const meta = MODULES.find((m) => m.key === module);
  document.title = `${meta?.label || 'Panel'} · Nexora Admin`;

  if (!user) {
    $('#sidebar').innerHTML = '';
    $('#content').innerHTML = '<div class="denied"><h1>Sin usuarios activos</h1><p>No hay personal activo para iniciar sesión. Restablece los datos demo.</p></div>';
    return null;
  }

  renderSidebar();
  renderTopbar();
  bindChrome();
  refreshChrome();
  onDataChange(refreshChrome);
  // Si cambia la sesión en otra pestaña, se recarga para aplicar permisos
  window.addEventListener('storage', (e) => { if (e.key && e.key.includes('session')) location.reload(); });

  if (!can('view')) { renderDenied(); return null; }
  applyPermissions();
  return ctx;
}

/** Utilidades de rango de fechas compartidas (reportes / resumen). */
export const dates = { dayKey, addDays, startOfDay };

