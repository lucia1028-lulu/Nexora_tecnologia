(function () {
  'use strict';

  /* Respaldo en memoria para file:/// o navegadores que restringen localStorage. */
  const memory = new Map();
  const failed = new Set();
  const NEXORA_STORE = {
    getItem(key) {
      if (failed.has(key)) return memory.has(key) ? memory.get(key) : null;
      try {
        const value = window.localStorage.getItem(key);
        return value === null && memory.has(key) ? memory.get(key) : value;
      } catch (e) {
        failed.add(key);
        return memory.has(key) ? memory.get(key) : null;
      }
    },
    setItem(key, value) {
      const v = String(value);
      memory.set(key, v);
      try { window.localStorage.setItem(key, v); failed.delete(key); }
      catch (e) { failed.add(key); }
    },
    removeItem(key) {
      memory.delete(key);
      try { window.localStorage.removeItem(key); failed.delete(key); }
      catch (e) { failed.add(key); }
    },
  };
  window.NEXORA_STORE = NEXORA_STORE;

/* ==========================================================================
   NEXORA ADMIN · data-mock.js
   Base de datos simulada y coherente en NEXORA_STORE.
   Todos los módulos leen/escriben aquí, de modo que productos, stock,
   pedidos, promociones, usuarios y roles permanecen sincronizados
   (incluso entre pestañas, gracias al evento `storage`).
   ========================================================================== */

const STORAGE_KEY = 'nexora.admin.db.v1';
const SESSION_KEY = 'nexora.admin.session.v1';
const IGV_RATE = 0.18;

/* ---------------------------------------------------------------------------
   Catálogos y constantes
   --------------------------------------------------------------------------- */
const ACTIONS = { view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar' };

/** Módulos del panel (alimentan el sidebar y la matriz de permisos). */
const MODULES = [
  { key: 'resumen',     label: 'Resumen',        href: 'resumen.html',     icon: 'ph-squares-four', group: 'Principal',      actions: ['view'] },
  { key: 'caja',        label: 'Venta de Caja',  href: 'caja.html',        icon: 'ph-receipt',      group: 'Operaciones',    actions: ['view', 'create'], labels: { create: 'Vender' } },
  { key: 'pedidos',     label: 'Pedidos',        href: 'pedidos.html',     icon: 'ph-package',      group: 'Operaciones',    actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'inventario',  label: 'Inventario',     href: 'inventario.html',  icon: 'ph-stack',        group: 'Operaciones',    actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'productos',   label: 'Productos',      href: 'productos.html',   icon: 'ph-laptop',       group: 'Operaciones',    actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'promociones', label: 'Promociones',    href: 'promociones.html', icon: 'ph-tag',          group: 'Operaciones',    actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'usuarios',    label: 'Usuarios',       href: 'usuarios.html',    icon: 'ph-users',        group: 'Administración', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'roles',       label: 'Roles y permisos', href: 'roles.html',     icon: 'ph-shield-check', group: 'Administración', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'reportes',    label: 'Reportes',       href: 'reportes.html',    icon: 'ph-chart-bar',    group: 'Administración', actions: ['view', 'create'], labels: { create: 'Exportar' } },
];

const CATEGORIES = ['Laptops', 'PCs', 'Componentes', 'Monitores', 'Periféricos'];
const SKU_PREFIX = { Laptops: 'LAP', PCs: 'PCS', Componentes: 'CMP', Monitores: 'MON', Periféricos: 'PER' };

/** Especificaciones técnicas por categoría (clave → etiqueta). */
const SPEC_FIELDS = {
  Laptops: [
    { key: 'cpu', label: 'Procesador', ph: 'Intel Core i7-13700H' },
    { key: 'ram', label: 'Memoria RAM', ph: '16 GB DDR5' },
    { key: 'storage', label: 'Almacenamiento', ph: '1 TB SSD NVMe' },
    { key: 'gpu', label: 'Tarjeta gráfica', ph: 'RTX 4060 8 GB' },
    { key: 'screen', label: 'Pantalla', ph: '15.6" OLED 120 Hz' },
    { key: 'os', label: 'Sistema operativo', ph: 'Windows 11 Pro' },
  ],
  PCs: [
    { key: 'cpu', label: 'Procesador', ph: 'Intel Core i9-14900KF' },
    { key: 'ram', label: 'Memoria RAM', ph: '32 GB DDR5' },
    { key: 'storage', label: 'Almacenamiento', ph: '2 TB SSD NVMe' },
    { key: 'gpu', label: 'Tarjeta gráfica', ph: 'RTX 4080 16 GB' },
    { key: 'psu', label: 'Fuente de poder', ph: '850 W 80+ Gold' },
    { key: 'case', label: 'Gabinete', ph: 'Torre ATX vidrio templado' },
  ],
  Componentes: [
    { key: 'type', label: 'Tipo de componente', ph: 'Tarjeta gráfica' },
    { key: 'model', label: 'Capacidad / Modelo', ph: '16 GB GDDR6X' },
    { key: 'iface', label: 'Interfaz', ph: 'PCIe 4.0 x16' },
    { key: 'warranty', label: 'Garantía', ph: '24 meses' },
  ],
  Monitores: [
    { key: 'size', label: 'Tamaño', ph: '27"' },
    { key: 'res', label: 'Resolución', ph: '3840 × 2160 (4K)' },
    { key: 'panel', label: 'Tipo de panel', ph: 'OLED' },
    { key: 'hz', label: 'Frecuencia', ph: '240 Hz' },
  ],
  Periféricos: [
    { key: 'type', label: 'Tipo', ph: 'Teclado mecánico' },
    { key: 'conn', label: 'Conectividad', ph: 'Inalámbrico 2.4 GHz / Bluetooth' },
    { key: 'feat', label: 'Característica clave', ph: 'Switches Razer Yellow' },
  ],
};

const ORDER_STATUSES = ['Pendiente', 'Procesando', 'Enviado', 'Entregado', 'Cancelado'];
const ORDER_FLOW = ['Pendiente', 'Procesando', 'Enviado', 'Entregado'];
const PAYMENT_METHODS = ['Yape/Plin', 'Tarjeta', 'Efectivo', 'Transferencia'];
const COURIERS = ['Olva Courier', 'Shalom', 'Delivery Nexora'];

/* ---------------------------------------------------------------------------
   Utilidades de fecha / número
   --------------------------------------------------------------------------- */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pad = (n) => String(n).padStart(2, '0');
/** Clave local AAAA-MM-DD (no UTC). */
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const todayKey = () => dayKey(new Date());

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Totales de una venta. Los precios de Nexora ya incluyen IGV (18 %). */
function calcTotals(lines) {
  const total = round2(lines.reduce((acc, l) => acc + l.qty * l.price, 0));
  const subtotal = round2(total / (1 + IGV_RATE));
  return { total, subtotal, igv: round2(total - subtotal) };
}

/* ---------------------------------------------------------------------------
   Semilla (datos iniciales coherentes)
   --------------------------------------------------------------------------- */
const img = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=480&h=360&q=70`;

// [nombre, marca, categoría, precio, stock objetivo, stock mínimo, imagen, specs, estado]
const PRODUCT_SEED = [
  ['MacBook Pro 14" M3 Pro', 'Apple', 'Laptops', 8999, 6, 3, '1517336714731-489689fd1ca8', { cpu: 'Apple M3 Pro 11 núcleos', ram: '18 GB', storage: '512 GB SSD', gpu: 'GPU 14 núcleos', screen: '14.2" Liquid Retina XDR', os: 'macOS Sonoma' }],
  ['ASUS ROG Zephyrus G14', 'ASUS', 'Laptops', 6899, 9, 4, '1593642632823-8f785ba67e45', { cpu: 'AMD Ryzen 9 8945HS', ram: '32 GB DDR5', storage: '1 TB SSD NVMe', gpu: 'RTX 4070 8 GB', screen: '14" OLED 120 Hz', os: 'Windows 11 Home' }],
  ['Lenovo ThinkPad X1 Carbon', 'Lenovo', 'Laptops', 5799, 2, 4, '1496181133206-80ce9b88a853', { cpu: 'Intel Core Ultra 7 155U', ram: '16 GB LPDDR5x', storage: '512 GB SSD', gpu: 'Intel Arc Graphics', screen: '14" WUXGA IPS', os: 'Windows 11 Pro' }],
  ['HP Spectre x360 14', 'HP', 'Laptops', 5499, 7, 3, '1525547719571-a2d4ac8945e2', { cpu: 'Intel Core Ultra 7 155H', ram: '16 GB LPDDR5', storage: '1 TB SSD', gpu: 'Intel Arc Graphics', screen: '14" 2.8K OLED táctil', os: 'Windows 11 Home' }],
  ['Dell XPS 15 OLED', 'Dell', 'Laptops', 7899, 1, 3, '1541807084-5c52b6b3adef', { cpu: 'Intel Core i7-13700H', ram: '32 GB DDR5', storage: '1 TB SSD', gpu: 'RTX 4060 8 GB', screen: '15.6" 3.5K OLED', os: 'Windows 11 Pro' }],
  ['Lenovo Legion 5 Pro', 'Lenovo', 'Laptops', 6299, 12, 4, '1588872657578-7efd1f1555ed', { cpu: 'AMD Ryzen 7 7745HX', ram: '16 GB DDR5', storage: '1 TB SSD NVMe', gpu: 'RTX 4070 8 GB', screen: '16" WQXGA 165 Hz', os: 'Windows 11 Home' }],
  ['MSI Aegis RS Gamer i9', 'MSI', 'PCs', 10999, 4, 2, '1587831990711-23ca6441447b', { cpu: 'Intel Core i9-14900KF', ram: '64 GB DDR5', storage: '2 TB SSD NVMe', gpu: 'RTX 4080 16 GB', psu: '850 W 80+ Gold', case: 'Torre ATX vidrio templado' }],
  ['Corsair Vengeance i7400', 'Corsair', 'PCs', 12499, 3, 2, '1591488320449-011701bb6704', { cpu: 'Intel Core i9-14900K', ram: '64 GB DDR5 6000 MHz', storage: '2 TB SSD NVMe', gpu: 'RTX 4090 24 GB', psu: '1000 W 80+ Platinum', case: 'Torre ATX refrigeración líquida' }],
  ['Alienware Aurora R16', 'Dell', 'PCs', 9799, 0, 2, '1555617981-dac3880eac6e', { cpu: 'Intel Core i7-14700F', ram: '32 GB DDR5', storage: '1 TB SSD NVMe', gpu: 'RTX 4070 Ti Super', psu: '1000 W', case: 'Torre Legend 3' }],
  ['NVIDIA GeForce RTX 4080 SUPER', 'NVIDIA', 'Componentes', 4699, 8, 3, '1555680202-c86f0e12f086', { type: 'Tarjeta gráfica', model: '16 GB GDDR6X', iface: 'PCIe 4.0 x16', warranty: '24 meses' }],
  ['Corsair Dominator 32GB DDR5', 'Corsair', 'Componentes', 649, 25, 10, '1587202372775-e229f172b9d7', { type: 'Memoria RAM', model: '2 × 16 GB 6000 MHz', iface: 'DDR5 DIMM', warranty: 'Garantía limitada de por vida' }],
  ['Samsung 990 PRO 2TB NVMe', 'Samsung', 'Componentes', 599, 14, 10, '1597872200969-2b65d56bd16b', { type: 'SSD', model: '2 TB', iface: 'M.2 PCIe 4.0 x4', warranty: '60 meses' }],
  ['AMD Ryzen 9 7950X', 'AMD', 'Componentes', 1899, 11, 5, '1518770660439-4636190af475', { type: 'Procesador', model: '16 núcleos / 32 hilos', iface: 'Socket AM5', warranty: '36 meses' }],
  ['ASUS ROG Strix B650E-F', 'ASUS', 'Componentes', 1299, 6, 4, '1629429407759-01cd3d7cfb38', { type: 'Placa madre', model: 'ATX · Wi-Fi 6E', iface: 'Socket AM5', warranty: '36 meses' }],
  ['LG UltraGear 27" 4K OLED', 'LG', 'Monitores', 3299, 5, 3, '1527443224154-c4a3942d3acf', { size: '27"', res: '3840 × 2160 (4K)', panel: 'OLED', hz: '240 Hz' }],
  ['Samsung Odyssey G7 32"', 'Samsung', 'Monitores', 2199, 4, 4, '1611186871348-b1ce696e52c9', { size: '32"', res: '2560 × 1440 (QHD)', panel: 'VA curvo 1000R', hz: '240 Hz' }],
  ['Logitech MX Master 3S', 'Logitech', 'Periféricos', 449, 30, 12, '1593305841991-05c297ba4575', { type: 'Mouse ergonómico', conn: 'Bluetooth / Logi Bolt', feat: 'Sensor 8000 DPI · clic silencioso' }],
  ['Razer BlackWidow V4 Pro', 'Razer', 'Periféricos', 899, 9, 8, '1587614382346-4ec70e388b28', { type: 'Teclado mecánico', conn: 'USB-C cableado', feat: 'Switches Razer Green · Chroma RGB' }],
  ['HP Pavilion Gaming 15 (descontinuado)', 'HP', 'Laptops', 3499, 3, 2, '1498050108023-c5249f4df085', { cpu: 'AMD Ryzen 5 5600H', ram: '8 GB DDR4', storage: '512 GB SSD', gpu: 'GTX 1650 4 GB', screen: '15.6" FHD 144 Hz', os: 'Windows 11 Home' }, 'Inactivo'],
];

const CUSTOMER_SEED = [
  ['Valeria Campos', 'valeria.campos@gmail.com', '987 120 331'],
  ['Diego Huamán', 'diego.huaman@outlook.com', '954 880 112'],
  ['Camila Rojas', 'camila.rojas@gmail.com', '968 441 207'],
  ['Renato Paredes', 'renato.paredes@hotmail.com', '912 665 018'],
  ['Sofía Valdivia', 'sofia.valdivia@gmail.com', '997 302 554'],
  ['Mateo Salazar', 'mateo.salazar@utp.edu.pe', '945 118 673'],
  ['Isabella Cruz', 'isabella.cruz@gmail.com', '981 770 245'],
  ['Andrés Medina', 'andres.medina@empresa.pe', '933 509 861'],
  ['Luciana Flores', 'luciana.flores@gmail.com', '976 224 019'],
  ['Joaquín Tello', 'joaquin.tello@gmail.com', '960 381 742'],
  ['Fernanda Vera', 'fernanda.vera@outlook.com', '921 047 395'],
  ['Sebastián Ortiz', 'sebastian.ortiz@gmail.com', '989 613 270'],
];

const DISTRICTS = ['Miraflores', 'San Isidro', 'Surco', 'La Molina', 'San Borja', 'Jesús María', 'Los Olivos', 'San Miguel', 'Barranco', 'Magdalena'];
const STREETS = ['Av. Larco', 'Av. Javier Prado', 'Calle Los Pinos', 'Av. Benavides', 'Jr. de la Unión', 'Av. La Marina', 'Calle Las Begonias', 'Av. Arequipa'];

function buildPermissions(map) {
  const perms = {};
  MODULES.forEach((m) => {
    const code = map === 'all' ? 'vced' : (map[m.key] || '');
    perms[m.key] = {
      view: code.includes('v'),
      create: m.actions.includes('create') && code.includes('c'),
      edit: m.actions.includes('edit') && code.includes('e'),
      delete: m.actions.includes('delete') && code.includes('d'),
    };
  });
  return perms;
}

function buildSeed() {
  const rand = mulberry32(2026);
  const now = new Date();
  const today = startOfDay(now);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const DAYS = 75;

  /* Roles */
  const roles = [
    { id: 'role_admin', name: 'Administrador', description: 'Acceso total al sistema, usuarios y configuración.', system: true, tone: 'primary', permissions: buildPermissions('all') },
    { id: 'role_caja', name: 'Vendedor de Caja', description: 'Atiende el punto de venta y consulta catálogo y pedidos.', system: false, tone: 'success', permissions: buildPermissions({ resumen: 'v', caja: 'vc', productos: 'v', pedidos: 'v', promociones: 'v' }) },
    { id: 'role_almacen', name: 'Almacenero', description: 'Controla stock, kardex y despacho de pedidos.', system: false, tone: 'warning', permissions: buildPermissions({ resumen: 'v', inventario: 'vce', productos: 've', pedidos: 've', reportes: 'v' }) },
  ];

  /* Usuarios: personal + clientes */
  const staff = [
    ['Carlos Mendoza', 'carlos.mendoza@nexora.pe', '999 100 200', 'role_admin', 'Activo'],
    ['Lucía Ramírez', 'lucia.ramirez@nexora.pe', '999 100 201', 'role_caja', 'Activo'],
    ['Jorge Quispe', 'jorge.quispe@nexora.pe', '999 100 202', 'role_almacen', 'Activo'],
    ['Andrea Torres', 'andrea.torres@nexora.pe', '999 100 203', 'role_caja', 'Activo'],
    ['Marco Salas', 'marco.salas@nexora.pe', '999 100 204', 'role_almacen', 'Inactivo'],
  ];
  const users = staff.map((s, i) => ({
    id: `U${pad(i + 1)}`, type: 'Personal', name: s[0], email: s[1], phone: s[2], roleId: s[3], status: s[4],
    createdAt: addDays(today, -200 + i * 9).toISOString(), lastAccess: addDays(now, -i).toISOString(),
  }));
  CUSTOMER_SEED.forEach((c, i) => users.push({
    id: `U${pad(staff.length + i + 1)}`, type: 'Cliente', name: c[0], email: c[1], phone: c[2], roleId: null,
    status: 'Activo', createdAt: addDays(today, -120 + i * 7).toISOString(), lastAccess: addDays(now, -(i % 9)).toISOString(),
  }));

  /* Productos */
  const counters = {};
  const products = PRODUCT_SEED.map((p, i) => {
    const [name, brand, category, price, stock, minStock, image, specs, status] = p;
    counters[category] = (counters[category] || 0) + 1;
    return {
      id: `P${String(i + 1).padStart(3, '0')}`,
      sku: `${SKU_PREFIX[category]}-${String(counters[category]).padStart(4, '0')}`,
      name, brand, category, price,
      cost: Math.round(price * (0.72 + rand() * 0.1)),
      stock, minStock, status: status || 'Activo',
      image: img(image), specs,
      description: `${name} de ${brand}. Equipo original con garantía oficial Nexora.`,
      createdAt: addDays(today, -DAYS - 20).toISOString(),
      _target: stock,
    };
  });

  /* Pedidos y ventas de caja */
  const cashiers = users.filter((u) => u.roleId === 'role_caja' && u.status === 'Activo');
  const customers = users.filter((u) => u.type === 'Cliente');
  const sellable = products.filter((p) => p.status === 'Activo');
  const orders = [];
  let webN = 1000;
  let cajN = 0;

  const pickProduct = () => {
    const weights = sellable.map((p) => 1 / Math.pow(p.price, 0.4));
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < sellable.length; i++) { r -= weights[i]; if (r <= 0) return sellable[i]; }
    return sellable[0];
  };
  const statusFor = (age, channel) => {
    if (channel === 'caja') return 'Entregado';
    const r = rand();
    if (age > 7) return r < 0.93 ? 'Entregado' : 'Cancelado';
    if (age > 3) return r < 0.55 ? 'Entregado' : r < 0.88 ? 'Enviado' : r < 0.95 ? 'Procesando' : 'Cancelado';
    if (age > 1) return r < 0.2 ? 'Entregado' : r < 0.5 ? 'Enviado' : r < 0.85 ? 'Procesando' : 'Pendiente';
    return r < 0.55 ? 'Pendiente' : r < 0.9 ? 'Procesando' : 'Enviado';
  };
  const cap = (d) => (d > now ? new Date(now.getTime() - 60000) : d);

  function makeOrder(day, age, channel) {
    const hour = 9 + Math.floor(rand() * 11);
    const date = cap(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, Math.floor(rand() * 60)));
    const used = new Set();
    const lines = [];
    const n = 1 + (rand() < 0.3 ? 1 : 0) + (rand() < 0.1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const p = pickProduct();
      if (used.has(p.id)) continue;
      used.add(p.id);
      const qty = p.price < 1000 ? 1 + Math.floor(rand() * 3) : (rand() < 0.12 ? 2 : 1);
      lines.push({ productId: p.id, sku: p.sku, name: p.name, qty, listPrice: p.price, discount: 0, price: p.price });
    }
    const status = statusFor(age, channel);
    const customer = channel === 'web' || rand() < 0.4 ? pick(customers) : null;
    const id = channel === 'web' ? `PED-${++webN}` : `CAJ-${String(++cajN).padStart(4, '0')}`;
    const t = calcTotals(lines);
    const stamp = (h) => cap(new Date(date.getTime() + h * 3600 * 1000)).toISOString();

    let history;
    if (channel === 'caja') history = [{ status: 'Entregado', date: date.toISOString(), by: 'Caja', note: 'Venta en tienda' }];
    else if (status === 'Cancelado') history = [{ status: 'Pendiente', date: date.toISOString(), by: 'Sistema', note: 'Pedido recibido' }, { status: 'Cancelado', date: stamp(5), by: 'Sistema', note: 'Cancelado por el cliente' }];
    else {
      const upto = ORDER_FLOW.indexOf(status);
      history = ORDER_FLOW.slice(0, upto + 1).map((s, k) => ({ status: s, date: k === 0 ? date.toISOString() : stamp(k * 20), by: k === 0 ? 'Sistema' : 'Jorge Quispe', note: k === 0 ? 'Pedido recibido' : '' }));
    }

    const shipped = channel === 'web' && (status === 'Enviado' || status === 'Entregado');
    const r = rand();
    const payment = channel === 'web'
      ? { method: r < 0.5 ? 'Tarjeta' : r < 0.85 ? 'Yape/Plin' : 'Transferencia', ref: '' }
      : { method: r < 0.35 ? 'Efectivo' : r < 0.7 ? 'Yape/Plin' : 'Tarjeta', ref: '' };

    orders.push({
      id, channel, date: date.toISOString(),
      customer: customer ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, doc: '' } : { id: null, name: 'Cliente general', email: '', phone: '', doc: '' },
      address: channel === 'web' ? { district: pick(DISTRICTS), line: `${pick(STREETS)} ${100 + Math.floor(rand() * 900)}` } : null,
      items: lines, ...t, discountTotal: 0, couponCode: '',
      payment, status, history,
      shipping: shipped ? { courier: pick(COURIERS), tracking: `NX${Math.floor(10000000 + rand() * 89999999)}` } : null,
      cashier: channel === 'caja' ? pick(cashiers).name : null,
      comprobante: channel === 'caja' ? { type: 'Boleta', doc: '' } : null,
    });
  }

  for (let age = DAYS; age >= 0; age--) {
    const day = addDays(today, -age);
    const weekend = day.getDay() === 5 || day.getDay() === 6;
    const web = Math.floor(rand() * 3.2) + (weekend ? 1 : 0);
    const caja = Math.floor(rand() * 2.6);
    for (let i = 0; i < web; i++) makeOrder(day, age, 'web');
    for (let i = 0; i < caja; i++) makeOrder(day, age, 'caja');
  }

  /* Kardex coherente: stock inicial + extras + salidas por venta = stock objetivo */
  const sold = {};
  orders.filter((o) => o.status !== 'Cancelado').forEach((o) => o.items.forEach((l) => { sold[l.productId] = (sold[l.productId] || 0) + l.qty; }));
  const extras = [
    { pid: 'P002', d: 12, type: 'Entrada', qty: 1, reason: 'Devolución de cliente', ref: 'DEV-0007' },
    { pid: 'P012', d: 20, type: 'Salida', qty: 1, reason: 'Merma / daño', ref: '' },
    { pid: 'P003', d: 30, type: 'Entrada', qty: 2, reason: 'Compra a proveedor', ref: 'OC-2026-044' },
    { pid: 'P011', d: 8, type: 'Entrada', qty: 10, reason: 'Compra a proveedor', ref: 'OC-2026-051' },
    { pid: 'P016', d: 15, type: 'Salida', qty: 1, reason: 'Uso interno / demostración', ref: '' },
  ];
  const raw = [];
  products.forEach((p, i) => {
    let initial = p._target + (sold[p.id] || 0);
    extras.filter((e) => e.pid === p.id).forEach((e) => { initial += e.type === 'Salida' ? e.qty : -e.qty; });
    raw.push({ date: new Date(addDays(today, -(DAYS + 5)).getTime() + (10 + i % 4) * 3600 * 1000), productId: p.id, type: 'Entrada', qty: initial, reason: 'Compra a proveedor', reference: `OC-2026-${String(10 + i).padStart(3, '0')}`, note: 'Stock inicial del periodo', user: 'Jorge Quispe' });
  });
  extras.forEach((e) => raw.push({ date: new Date(addDays(today, -e.d).getTime() + 15 * 3600 * 1000), productId: e.pid, type: e.type, qty: e.qty, reason: e.reason, reference: e.ref, note: '', user: 'Jorge Quispe' }));
  orders.filter((o) => o.status !== 'Cancelado').forEach((o) => o.items.forEach((l) => raw.push({
    date: new Date(o.date), productId: l.productId, type: 'Salida', qty: l.qty, reason: o.channel === 'web' ? 'Venta web' : 'Venta caja', reference: o.id, note: '', user: o.cashier || 'Sistema',
  })));
  raw.sort((a, b) => a.date - b.date);
  const balances = {};
  const movements = raw.map((m, i) => {
    const sign = m.type === 'Salida' ? -1 : 1;
    balances[m.productId] = (balances[m.productId] || 0) + sign * m.qty;
    const p = products.find((x) => x.id === m.productId);
    return { id: `MOV-${String(i + 1).padStart(4, '0')}`, date: m.date.toISOString(), productId: p.id, sku: p.sku, productName: p.name, type: m.type, qty: m.qty, delta: sign * m.qty, balance: balances[m.productId], reason: m.reason, reference: m.reference, note: m.note, user: m.user };
  });
  products.forEach((p) => { p.stock = balances[p.id] ?? p._target; delete p._target; });

  /* Promociones (fechas relativas a hoy) */
  const d = (n) => dayKey(addDays(today, n));
  const promotions = [
    { id: 'PRM-001', name: 'Semana Gamer', description: 'Descuento en PCs gamer de alto rendimiento.', type: 'percent', value: 15, scope: 'category', category: 'PCs', productIds: [], code: '', startDate: d(-5), endDate: d(10), active: true, used: 6 },
    { id: 'PRM-002', name: 'Cyber Nexora', description: 'Cupón general para toda la tienda.', type: 'percent', value: 10, scope: 'all', category: '', productIds: [], code: 'NEXORA10', startDate: d(-10), endDate: d(20), active: true, used: 23 },
    { id: 'PRM-003', name: 'Liquidación Laptops', description: 'S/ 300 menos en laptops seleccionadas.', type: 'amount', value: 300, scope: 'products', category: '', productIds: ['P002', 'P003', 'P005'], code: '', startDate: d(-3), endDate: d(3), active: true, used: 9 },
    { id: 'PRM-004', name: 'Upgrade Day', description: 'Mejora tu setup con descuento en componentes.', type: 'percent', value: 12, scope: 'category', category: 'Componentes', productIds: [], code: '', startDate: d(5), endDate: d(12), active: true, used: 0 },
    { id: 'PRM-005', name: 'Black Friday Anticipado', description: 'Campaña del mes pasado.', type: 'percent', value: 20, scope: 'all', category: '', productIds: [], code: 'BLACK20', startDate: d(-40), endDate: d(-30), active: true, used: 58 },
    { id: 'PRM-006', name: 'Bienvenida', description: 'Cupón de bienvenida para nuevos clientes.', type: 'amount', value: 50, scope: 'all', category: '', productIds: [], code: 'BIENVENIDO50', startDate: d(-60), endDate: d(60), active: false, used: 14 },
  ];

  return { version: 1, products, movements, promotions, orders, users, roles };
}

/* ---------------------------------------------------------------------------
   Almacenamiento y sincronización
   --------------------------------------------------------------------------- */
let state = load();
const listeners = new Set();

function persist(s) {
  try { NEXORA_STORE.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (err) { console.warn('No se pudo guardar en localStorage', err); }
}
function load() {
  try {
    const raw = NEXORA_STORE.getItem(STORAGE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.version === 1) return s; }
  } catch { /* datos corruptos: se regenera */ }
  const seed = buildSeed();
  persist(seed);
  return seed;
}
function notify() { listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } }); }

/** Suscribe una función que se ejecuta cuando cambian los datos (en esta u otra pestaña). */
function onDataChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { state = load(); notify(); }
});

const db = {
  all: (col) => state[col],
  get: (col, id) => state[col].find((x) => x.id === id),
  insert(col, item) { state[col].push(item); this.commit(); return item; },
  update(col, id, patch) {
    const item = this.get(col, id);
    if (!item) throw new Error('Registro no encontrado');
    Object.assign(item, patch);
    this.commit();
    return item;
  },
  remove(col, id) { state[col] = state[col].filter((x) => x.id !== id); this.commit(); },
  /** Siguiente ID con prefijo, p. ej. nextId('orders','PED-',4,1001) → PED-1042 */
  nextId(col, prefix, padTo = 3, start = 1) {
    const max = state[col].reduce((m, x) => {
      if (typeof x.id !== 'string' || !x.id.startsWith(prefix)) return m;
      const n = parseInt(x.id.slice(prefix.length), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, start - 1);
    return `${prefix}${String(max + 1).padStart(padTo, '0')}`;
  },
  commit() { persist(state); notify(); },
  reset() {
    state = buildSeed();
    persist(state);
    try { NEXORA_STORE.removeItem(SESSION_KEY); } catch { /* noop */ }
    notify();
  },
};

/* ---------------------------------------------------------------------------
   Sesión del administrador (simulada)
   --------------------------------------------------------------------------- */
function getSessionUser() {
  let id = null;
  try { id = NEXORA_STORE.getItem(SESSION_KEY); } catch { /* noop */ }
  const staff = state.users.filter((u) => u.type === 'Personal' && u.status === 'Activo');
  return staff.find((u) => u.id === id) || staff.find((u) => u.roleId === 'role_admin') || staff[0] || null;
}
function setSessionUser(id) { try { NEXORA_STORE.setItem(SESSION_KEY, id); } catch { /* noop */ } }

function hasPermission(roleId, module, action) {
  const role = db.get('roles', roleId);
  return !!(role && role.permissions && role.permissions[module] && role.permissions[module][action]);
}

/* ---------------------------------------------------------------------------
   Dominio: stock
   --------------------------------------------------------------------------- */
/** Nivel de stock: agotado / crítico / bajo / óptimo. */
function stockLevel(p) {
  if (p.stock <= 0) return { key: 'out', label: 'Agotado', tone: 'danger', rank: 0 };
  if (p.stock <= Math.floor(p.minStock / 2)) return { key: 'critical', label: 'Crítico', tone: 'danger', rank: 1 };
  if (p.stock <= p.minStock) return { key: 'low', label: 'Stock bajo', tone: 'warning', rank: 2 };
  return { key: 'ok', label: 'Óptimo', tone: 'success', rank: 3 };
}

function applyMovement({ productId, type, qty, reason, reference = '', note = '', user = 'Sistema', date = new Date() }) {
  const product = db.get('products', productId);
  if (!product) throw new Error('Producto no encontrado');
  const amount = Math.floor(Number(qty));
  if (!Number.isFinite(amount) || amount < 0 || (type !== 'Ajuste' && amount < 1)) throw new Error('Cantidad inválida');

  let delta;
  if (type === 'Entrada') delta = amount;
  else if (type === 'Salida') {
    if (amount > product.stock) throw new Error(`Stock insuficiente de "${product.name}" (disponible: ${product.stock})`);
    delta = -amount;
  } else if (type === 'Ajuste') delta = amount - product.stock; // `qty` = nuevo stock
  else throw new Error('Tipo de movimiento inválido');

  product.stock += delta;
  const mov = {
    id: db.nextId('movements', 'MOV-', 4),
    date: date.toISOString(), productId: product.id, sku: product.sku, productName: product.name,
    type, qty: Math.abs(delta), delta, balance: product.stock, reason, reference, note, user,
  };
  state.movements.push(mov);
  return mov;
}

/** Registra una entrada, salida o ajuste de stock y guarda el kardex. */
function adjustStock(payload) {
  const mov = applyMovement(payload);
  db.commit();
  return mov;
}

/* ---------------------------------------------------------------------------
   Dominio: promociones
   --------------------------------------------------------------------------- */
function promoStatus(p, now = new Date()) {
  if (!p.active) return 'Pausada';
  const t = dayKey(now);
  if (t < p.startDate) return 'Programada';
  if (t > p.endDate) return 'Vencida';
  return 'Vigente';
}
function promoApplies(p, product) {
  if (p.scope === 'all') return true;
  if (p.scope === 'category') return product.category === p.category;
  return (p.productIds || []).includes(product.id);
}
function promoUnitDiscount(p, price) {
  const raw = p.type === 'percent' ? (price * p.value) / 100 : p.value;
  return round2(Math.min(price, Math.max(0, raw)));
}
/**
 * Mejor promoción para un producto. Las promociones sin código se aplican solas;
 * las que tienen código solo si el cajero ingresa ese cupón. No se acumulan: gana la mayor.
 */
function bestPromo(product, { code = '' } = {}) {
  const wanted = String(code).trim().toUpperCase();
  let best = null;
  state.promotions.forEach((p) => {
    if (promoStatus(p) !== 'Vigente' || !promoApplies(p, product)) return;
    if (p.code && p.code.toUpperCase() !== wanted) return;
    const discount = promoUnitDiscount(p, product.price);
    if (discount > 0 && (!best || discount > best.discount)) best = { promo: p, discount };
  });
  return best;
}
function effectivePrice(product) {
  const best = bestPromo(product);
  return best ? round2(product.price - best.discount) : product.price;
}
function findCoupon(code) {
  const wanted = String(code).trim().toUpperCase();
  return state.promotions.find((p) => p.code && p.code.toUpperCase() === wanted);
}

/* ---------------------------------------------------------------------------
   Dominio: pedidos
   --------------------------------------------------------------------------- */
const isSale = (o) => o.status !== 'Cancelado';

/**
 * Crea un pedido (web o caja), descuenta stock y registra el kardex.
 * `items`: [{ productId, qty, discount, promoId }]
 */
function createOrder({ channel, customer, items, payment, status, cashier = null, address = null, couponCode = '', comprobante = null }) {
  if (!items.length) throw new Error('El pedido no tiene productos');
  const lines = items.map((it) => {
    const p = db.get('products', it.productId);
    if (!p) throw new Error('Producto no encontrado');
    if (p.stock < it.qty) throw new Error(`Stock insuficiente de "${p.name}" (disponible: ${p.stock})`);
    const discount = round2(it.discount || 0);
    return { productId: p.id, sku: p.sku, name: p.name, qty: it.qty, listPrice: p.price, discount, price: round2(p.price - discount), promoId: it.promoId || null };
  });
  const id = channel === 'caja' ? db.nextId('orders', 'CAJ-', 4) : db.nextId('orders', 'PED-', 4, 1001);
  const now = new Date();
  const totals = calcTotals(lines);
  const order = {
    id, channel, date: now.toISOString(), customer, address, items: lines, ...totals,
    discountTotal: round2(lines.reduce((a, l) => a + l.discount * l.qty, 0)), couponCode,
    payment, status,
    history: [{ status, date: now.toISOString(), by: cashier || 'Sistema', note: channel === 'caja' ? 'Venta en tienda' : 'Pedido recibido' }],
    shipping: null, cashier, comprobante,
  };
  lines.forEach((l) => applyMovement({
    productId: l.productId, type: 'Salida', qty: l.qty, reason: channel === 'caja' ? 'Venta caja' : 'Venta web',
    reference: id, user: cashier || 'Sistema', date: now,
  }));
  new Set(lines.map((l) => l.promoId).filter(Boolean)).forEach((pid) => { const pr = db.get('promotions', pid); if (pr) pr.used += 1; });
  state.orders.push(order);
  db.commit();
  return order;
}

/** Cambia el estado de un pedido validando el flujo; al cancelar devuelve el stock. */
function setOrderStatus(orderId, status, { by = 'Sistema', note = '', courier = '', tracking = '' } = {}) {
  const order = db.get('orders', orderId);
  if (!order) throw new Error('Pedido no encontrado');
  const from = order.status;
  if (from === 'Entregado' || from === 'Cancelado') throw new Error(`Un pedido ${from.toLowerCase()} no puede cambiar de estado`);
  if (status === 'Cancelado') {
    order.items.forEach((l) => {
      if (db.get('products', l.productId)) {
        applyMovement({ productId: l.productId, type: 'Entrada', qty: l.qty, reason: 'Anulación de pedido', reference: order.id, user: by });
      }
    });
  } else if (ORDER_FLOW.indexOf(status) !== ORDER_FLOW.indexOf(from) + 1) {
    throw new Error(`Transición inválida: ${from} → ${status}`);
  }
  if (status === 'Enviado') {
    if (!courier || !tracking) throw new Error('Indica courier y código de seguimiento');
    order.shipping = { courier, tracking };
  }
  order.status = status;
  order.history.push({ status, date: new Date().toISOString(), by, note });
  db.commit();
  return order;
}


  window.NEXORA_DATA = {
    STORAGE_KEY, SESSION_KEY, IGV_RATE,
    ACTIONS, MODULES, CATEGORIES, SKU_PREFIX, SPEC_FIELDS,
    ORDER_STATUSES, ORDER_FLOW, PAYMENT_METHODS, COURIERS,
    round2, startOfDay, addDays, dayKey, todayKey, calcTotals,
    onDataChange, db, getSessionUser, setSessionUser, hasPermission,
    stockLevel, adjustStock, promoStatus, promoApplies, promoUnitDiscount,
    bestPromo, effectivePrice, findCoupon, isSale, createOrder, setOrderStatus,
  };
})();
