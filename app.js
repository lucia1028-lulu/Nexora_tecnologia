/* ==========================================================================
   NEXORA · Lógica de la aplicación (Vanilla JS, ES6+)
   - Catálogo con búsqueda y filtros
   - Autenticación simulada (modal) que se exige para comprar / añadir al carrito
   - Carrito persistente por usuario + pasarela de pago simulada
   - Animaciones de scroll con IntersectionObserver
   ========================================================================== */
'use strict';

(() => {
  /* -----------------------------------------------------------------------
     DATOS
     ----------------------------------------------------------------------- */
  const img = (id, w = 640, h = 480) =>
    `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=75`;

  const PRODUCTS = [
    { id: 1,  name: 'MacBook Pro 14″ M3 Pro',        brand: 'Apple',    category: 'Laptops',     price: 8999,  img: '1517336714731-489689fd1ca8' },
    { id: 2,  name: 'ASUS ROG Zephyrus G14',          brand: 'ASUS',     category: 'Laptops',     price: 6899,  oldPrice: 7599,  img: '1593642632823-8f785ba67e45' },
    { id: 3,  name: 'Lenovo ThinkPad X1 Carbon',      brand: 'Lenovo',   category: 'Laptops',     price: 5799,  oldPrice: 6799,  img: '1496181133206-80ce9b88a853' },
    { id: 4,  name: 'HP Spectre x360 14',             brand: 'HP',       category: 'Laptops',     price: 5499,  img: '1525547719571-a2d4ac8945e2' },
    { id: 5,  name: 'Dell XPS 15 OLED',               brand: 'Dell',     category: 'Laptops',     price: 7899,  img: '1541807084-5c52b6b3adef' },
    { id: 6,  name: 'MSI Aegis RS Gamer i9 · RTX 4080', brand: 'MSI',    category: 'PCs',         price: 10999, oldPrice: 12999, img: '1587831990711-23ca6441447b' },
    { id: 7,  name: 'Corsair Vengeance i7400',        brand: 'Corsair',  category: 'PCs',         price: 12499, img: '1591488320449-011701bb6704' },
    { id: 8,  name: 'Alienware Aurora R16',           brand: 'Dell',     category: 'PCs',         price: 9799,  img: '1555617981-dac3880eac6e' },
    { id: 9,  name: 'NVIDIA GeForce RTX 4080 SUPER',  brand: 'NVIDIA',   category: 'Componentes', price: 4699,  oldPrice: 5499,  img: '1555680202-c86f0e12f086' },
    { id: 10, name: 'Corsair Dominator 32GB DDR5',    brand: 'Corsair',  category: 'Componentes', price: 649,   img: '1587202372775-e229f172b9d7' },
    { id: 11, name: 'Samsung 990 PRO 2TB NVMe',       brand: 'Samsung',  category: 'Componentes', price: 599,   oldPrice: 719,   img: '1597872200969-2b65d56bd16b' },
    { id: 12, name: 'LG UltraGear 27″ 4K OLED',       brand: 'LG',       category: 'Monitores',   price: 3299,  img: '1527443224154-c4a3942d3acf' },
    { id: 13, name: 'Samsung Odyssey G7 32″',         brand: 'Samsung',  category: 'Monitores',   price: 2199,  oldPrice: 2599,  img: '1611186871348-b1ce696e52c9' },
    { id: 14, name: 'Logitech MX Master 3S Combo',    brand: 'Logitech', category: 'Periféricos', price: 749,   img: '1593305841991-05c297ba4575' },
    { id: 15, name: 'Razer BlackWidow V4 Pro',        brand: 'Razer',    category: 'Periféricos', price: 899,   img: '1587614382346-4ec70e388b28' },
  ];

  const PROMOS = [
    { productId: 6, theme: 'blue',   tag: 'Semana Gamer',  title: 'PC gamer de otro nivel',     text: 'Intel Core i9 + RTX 4080 con refrigeración líquida lista para 4K.' },
    { productId: 3, theme: 'violet', tag: 'Ultraligeras',  title: 'Productividad sin peso',     text: 'La laptop ejecutiva más ligera, con batería para toda la jornada.' },
    { productId: 9, theme: 'silver', tag: 'Upgrade Day',   title: 'Potencia tu setup actual',   text: 'La GPU más rápida de su generación a un precio histórico.' },
  ];

  const FEATURED_PRODUCT_IDS = [2, 6, 9, 13];

  const PRICE_RANGES = [
    { label: 'Todos los precios',    value: '' },
    { label: 'Hasta S/ 1,000',       value: '0-1000' },
    { label: 'S/ 1,000 – S/ 3,000',  value: '1000-3000' },
    { label: 'S/ 3,000 – S/ 6,000',  value: '3000-6000' },
    { label: 'S/ 6,000 – S/ 10,000', value: '6000-10000' },
    { label: 'Más de S/ 10,000',     value: '10000-Infinity' },
  ];

  const MAX_QTY = 10;
  const KEYS = { session: 'nexora.session', users: 'nexora.users', cart: 'nexora.cart.' };

  /* -----------------------------------------------------------------------
     UTILIDADES
     ----------------------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const byId = (id) => document.getElementById(id);

  const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
  const formatPrice = (n) => money.format(n);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalize = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const discountPct = (p) => (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
  const findProduct = (id) => PRODUCTS.find((p) => p.id === Number(id));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* noop */ } },
  };

  // Fallback si alguna imagen remota falla (evita cuadros rotos)
  const FALLBACK_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dfe7ff"/><stop offset="1" stop-color="#eadfff"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><rect x="250" y="190" width="140" height="90" rx="10" fill="none" stroke="#7b8bd6" stroke-width="6"/></svg>'
  );
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.src !== FALLBACK_IMG) t.src = FALLBACK_IMG;
  }, true);

  /* -----------------------------------------------------------------------
     ESTADO
     ----------------------------------------------------------------------- */
  const state = {
    user: store.get(KEYS.session, null),
    cart: [],                 // [{ id, qty, checked }]
    pending: null,            // acción a ejecutar tras iniciar sesión
    filters: { q: '', category: '', price: '', brand: '' },
  };

  /* -----------------------------------------------------------------------
     REFERENCIAS DOM
     ----------------------------------------------------------------------- */
  const els = {
    header: byId('siteHeader'),
    nav: byId('mainNav'),
    menuToggle: byId('menuToggle'),
    cartBtn: byId('cartBtn'),
    cartCount: byId('cartCount'),
    profileBtn: byId('profileBtn'),
    grid: byId('productGrid'),
    empty: byId('emptyState'),
    resultsCount: byId('resultsCount'),
    filtersForm: byId('filtersForm'),
    search: byId('searchInput'),
    fCategory: byId('fCategory'),
    fPrice: byId('fPrice'),
    fBrand: byId('fBrand'),
    authDialog: byId('authDialog'),
    cartDialog: byId('cartDialog'),
    payDialog: byId('payDialog'),
    toasts: byId('toasts'),
  };

  /* -----------------------------------------------------------------------
     DIÁLOGOS (API nativa <dialog>)
     ----------------------------------------------------------------------- */
  function openDialog(dialog) {
    $$('dialog[open]').forEach((d) => { if (d !== dialog) d.close(); });
    if (!dialog.open) dialog.showModal();
  }

  // Cerrar con cualquier elemento [data-close]
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closer.closest('dialog')?.close();
  });

  // Fallback de "light dismiss" para navegadores sin soporte de closedby (p. ej. Safari)
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    $$('dialog[closedby="any"]').forEach((dialog) => {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => { pressedOutside = outside(e, dialog); });
      dialog.addEventListener('pointerup', (e) => { if (pressedOutside && outside(e, dialog)) dialog.close(); });
    });
  }

  /* -----------------------------------------------------------------------
     TOASTS
     ----------------------------------------------------------------------- */
  function toast(message, { icon = 'ph-check-circle', error = false } = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (error ? ' is-error' : '');
    const i = document.createElement('i');
    i.className = `ph-fill ${icon}`;
    i.setAttribute('aria-hidden', 'true');
    const span = document.createElement('span');
    span.textContent = message;
    el.append(i, span);
    els.toasts.append(el);

    // Se reabre el popover para situarlo por encima de cualquier modal abierto
    if (els.toasts.showPopover) {
      if (els.toasts.matches(':popover-open')) els.toasts.hidePopover();
      els.toasts.showPopover();
    }

    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 450);
    }, 3200);
  }

  /* -----------------------------------------------------------------------
     NAVEGACIÓN: header, menú móvil y scroll-spy
     ----------------------------------------------------------------------- */
  function initNavigation() {
    const onScroll = () => els.header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const setMenu = (open) => {
      els.nav.classList.toggle('is-open', open);
      els.menuToggle.setAttribute('aria-expanded', String(open));
      els.menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      els.menuToggle.firstElementChild.className = open ? 'ph ph-x' : 'ph ph-list';
    };
    els.menuToggle.addEventListener('click', () => setMenu(!els.nav.classList.contains('is-open')));
    els.nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav') && !e.target.closest('#menuToggle')) setMenu(false);
    });

    // Scroll-spy: resalta el enlace de la sección visible
    const links = $$('[data-spy]');
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.setAttribute('aria-current', String(a.dataset.spy === entry.target.id)));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['inicio', 'promociones', 'productos', 'consultas'].forEach((id) => {
      const section = byId(id);
      if (section) spy.observe(section);
    });
  }

  /* -----------------------------------------------------------------------
     ANIMACIONES DE SCROLL (IntersectionObserver)
     ----------------------------------------------------------------------- */
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  const observeReveals = (root = document) => {
    $$('.reveal:not(.is-visible)', root).forEach((el) => revealObserver.observe(el));
  };

  /* -----------------------------------------------------------------------
     CATÁLOGO
     ----------------------------------------------------------------------- */
  function fillSelect(select, options) {
    select.innerHTML = options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  }

  function initFilters() {
    const categories = [...new Set(PRODUCTS.map((p) => p.category))];
    const brands = [...new Set(PRODUCTS.map((p) => p.brand))].sort((a, b) => a.localeCompare(b));
    fillSelect(els.fCategory, [{ label: 'Todas las categorías', value: '' }, ...categories.map((c) => ({ label: c, value: c }))]);
    fillSelect(els.fPrice, PRICE_RANGES);
    fillSelect(els.fBrand, [{ label: 'Todas las marcas', value: '' }, ...brands.map((b) => ({ label: b, value: b }))]);

    const applyAll = () => {
      state.filters = {
        q: els.search.value,
        category: els.fCategory.value,
        price: els.fPrice.value,
        brand: els.fBrand.value,
      };
      renderProducts();
    };

    els.filtersForm.addEventListener('submit', (e) => { e.preventDefault(); applyAll(); });

    // La búsqueda responde mientras se escribe (con debounce)
    let timer;
    els.search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.filters.q = els.search.value; renderProducts(); }, 180);
    });

    const reset = () => {
      els.filtersForm.reset();
      applyAll();
    };
    byId('clearFilters').addEventListener('click', reset);
    byId('emptyReset').addEventListener('click', reset);
  }

  function getFilteredProducts() {
    const { q, category, price, brand } = state.filters;
    const [min, max] = price ? price.split('-').map(Number) : [0, Infinity];
    const terms = normalize(q).split(/\s+/).filter(Boolean);
    return PRODUCTS.filter((p) => {
      if (category && p.category !== category) return false;
      if (brand && p.brand !== brand) return false;
      if (p.price < min || p.price > max) return false;
      const haystack = normalize(`${p.name} ${p.brand} ${p.category}`);
      return terms.every((t) => haystack.includes(t));
    });
  }

  const productCard = (p, i) => `
    <li class="reveal" style="--d:${(i % 4) * 70}ms">
      <article class="card">
        <div class="card__media">
          <img src="${img(p.img)}" alt="${esc(p.name)}" width="640" height="480" loading="lazy" decoding="async">
          <span class="tag">${esc(p.category)}</span>
          ${p.oldPrice ? `<span class="badge-off">-${discountPct(p)}%</span>` : ''}
        </div>
        <div class="card__body">
          <p class="card__brand"><i class="ph-fill ph-seal-check" aria-hidden="true"></i>${esc(p.brand)}</p>
          <h3 class="card__title">${esc(p.name)}</h3>
          <div class="card__price">
            <strong>${formatPrice(p.price)}</strong>
            ${p.oldPrice ? `<s aria-label="Precio anterior">${formatPrice(p.oldPrice)}</s>` : ''}
          </div>
          <button type="button" class="btn btn--primary btn--block" data-buy="${p.id}">
            <i class="ph ph-shopping-bag" aria-hidden="true"></i> COMPRAR
          </button>
        </div>
      </article>
    </li>`;

  function renderProducts() {
    const list = getFilteredProducts();
    els.grid.innerHTML = list.map(productCard).join('');
    els.empty.hidden = list.length > 0;
    els.resultsCount.innerHTML = `Mostrando <strong>${list.length}</strong> de ${PRODUCTS.length} productos`;
    observeReveals(els.grid);
  }

  function renderFeaturedProducts() {
    const grid = byId('featuredGrid');
    if (!grid) return;
    grid.innerHTML = FEATURED_PRODUCT_IDS.map(findProduct).map(productCard).join('');
    observeReveals(grid);
  }

  /* -----------------------------------------------------------------------
     HERO + PROMOCIONES (carrusel accesible)
     ----------------------------------------------------------------------- */
  function renderHero() {
    const star = findProduct(1);
    const starImg = byId('starImg');
    starImg.src = img(star.img, 900, 700);
    byId('starPrice').textContent = formatPrice(star.price);
  }

  function renderPromos() {
    const track = byId('promoTrack');
    track.innerHTML = PROMOS.map((promo, i) => {
      const p = findProduct(promo.productId);
      return `
      <article class="promo promo--${promo.theme}" role="group" aria-roledescription="diapositiva" aria-label="${i + 1} de ${PROMOS.length}">
        <div class="promo__body">
          <span class="promo__tag">${esc(promo.tag)}</span>
          <p class="promo__off grad-text">-${discountPct(p)}%</p>
          <h3 class="promo__title">${esc(promo.title)}</h3>
          <p class="promo__text">${esc(promo.text)}</p>
          <p class="promo__price"><strong>${formatPrice(p.price)}</strong><s>${formatPrice(p.oldPrice)}</s></p>
          <button type="button" class="btn btn--primary btn--lg" data-buy="${p.id}">
            <i class="ph ph-shopping-cart-simple" aria-hidden="true"></i> Añadir al carrito
          </button>
        </div>
        <div class="promo__media"><img src="${img(p.img, 800, 700)}" alt="${esc(p.name)}" width="800" height="700" loading="lazy" decoding="async"></div>
      </article>`;
    }).join('');

    initCarousel();
  }

  function initCarousel() {
    const track = byId('promoTrack');
    const slides = $$('.promo', track);
    const dotsWrap = byId('promoDots');
    const toggle = byId('promoToggle');
    let index = 0;
    let playing = !prefersReducedMotion.matches;   // con "reducir movimiento" no arranca solo
    let hovering = false;
    let inView = false;
    let timer = null;

    dotsWrap.innerHTML = slides.map((_, i) =>
      `<button type="button" class="dot" aria-label="Ir a la promoción ${i + 1}" aria-current="${i === 0}" data-i="${i}"></button>`).join('');
    const dots = $$('.dot', dotsWrap);

    const go = (i) => {
      index = (i + slides.length) % slides.length;
      track.scrollTo({
        left: slides[index].offsetLeft - slides[0].offsetLeft,
        behavior: prefersReducedMotion.matches ? 'auto' : 'smooth',
      });
    };

    const setActive = (i) => {
      index = i;
      dots.forEach((d, n) => d.setAttribute('aria-current', String(n === i)));
    };

    const slideObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setActive(slides.indexOf(en.target)); });
    }, { root: track, threshold: 0.6 });
    slides.forEach((s) => slideObserver.observe(s));

    const schedule = () => {
      clearInterval(timer);
      if (playing && !hovering && inView) timer = setInterval(() => go(index + 1), 6000);
    };

    new IntersectionObserver(([en]) => { inView = en.isIntersecting; schedule(); }, { threshold: 0.3 }).observe(track);

    const syncToggle = () => {
      toggle.firstElementChild.className = playing ? 'ph ph-pause' : 'ph ph-play';
      toggle.setAttribute('aria-label', playing ? 'Pausar rotación automática' : 'Reanudar rotación automática');
    };
    syncToggle();

    toggle.addEventListener('click', () => { playing = !playing; syncToggle(); schedule(); });
    byId('promoPrev').addEventListener('click', () => go(index - 1));
    byId('promoNext').addEventListener('click', () => go(index + 1));
    dotsWrap.addEventListener('click', (e) => { const d = e.target.closest('.dot'); if (d) go(Number(d.dataset.i)); });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    });

    const carousel = track.closest('.carousel');
    carousel.addEventListener('pointerenter', () => { hovering = true; schedule(); });
    carousel.addEventListener('pointerleave', () => { hovering = false; schedule(); });
    carousel.addEventListener('focusin', () => { hovering = true; schedule(); });
    carousel.addEventListener('focusout', () => { hovering = false; schedule(); });
  }

  /* -----------------------------------------------------------------------
     AUTENTICACIÓN (simulada en el navegador)
     ----------------------------------------------------------------------- */
  const auth = {
    guest: byId('authGuest'),
    user: byId('authUser'),
    title: byId('authTitle'),
    notice: byId('authNotice'),
    loginForm: byId('loginForm'),
    registerForm: byId('registerForm'),
    tabs: $$('[data-tab]'),
  };

  const initialOf = (name) => (name.trim()[0] || 'U').toUpperCase();
  const titleCase = (s) => s.replace(/[._-]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());

  function updateAuthUI() {
    const user = state.user;
    const profileIcon = els.profileBtn;

    if (user) {
      profileIcon.innerHTML = `<span class="avatar" aria-hidden="true">${esc(initialOf(user.name))}</span>`;
      profileIcon.setAttribute('aria-label', `Perfil de ${user.name}`);
      byId('userAvatar').textContent = initialOf(user.name);
      byId('userName').textContent = user.name;
      byId('userEmail').textContent = user.email;
    } else {
      profileIcon.innerHTML = '<i class="ph ph-user" aria-hidden="true"></i>';
      profileIcon.setAttribute('aria-label', 'Perfil: iniciar sesión');
    }
    auth.guest.hidden = !!user;
    auth.user.hidden = !user;
    auth.title.textContent = user ? `Hola, ${user.name.split(' ')[0]}` : 'Bienvenido a Nexora';
  }

  function selectTab(name) {
    const isLogin = name === 'login';
    auth.tabs.forEach((t) => {
      const active = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });
    auth.loginForm.hidden = !isLogin;
    auth.registerForm.hidden = isLogin;
    (isLogin ? byId('lEmail') : byId('rName')).focus();
  }

  function openAuth({ reason = false } = {}) {
    auth.notice.hidden = !reason;
    if (!state.user) selectTab('login');
    openDialog(els.authDialog);
  }

  /** Ejecuta `action` si hay sesión; si no, abre el modal de login y la deja pendiente. */
  function requireAuth(action) {
    if (state.user) { action(); return; }
    state.pending = action;
    openAuth({ reason: true });
  }

  function completeLogin(user) {
    state.user = user;
    store.set(KEYS.session, user);
    state.cart = loadCart();
    updateAuthUI();
    renderCart();

    const pending = state.pending;
    state.pending = null;
    els.authDialog.close();
    toast(`¡Bienvenido, ${user.name.split(' ')[0]}!`, { icon: 'ph-hand-waving' });
    if (pending) pending();
  }

  function logout() {
    state.user = null;
    state.cart = [];
    store.remove(KEYS.session);
    updateAuthUI();
    renderCart();
    els.authDialog.close();
    toast('Sesión cerrada', { icon: 'ph-sign-out' });
  }

  function initAuth() {
    auth.tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
    auth.tabs.forEach((t) => t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') selectTab(t.dataset.tab === 'login' ? 'register' : 'login');
    }));

    auth.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = byId('lEmail').value.trim().toLowerCase();
      const users = store.get(KEYS.users, {});
      const name = users[email] || titleCase(email.split('@')[0]);
      auth.loginForm.reset();
      completeLogin({ name, email });
    });

    auth.registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = byId('rName').value.trim();
      const email = byId('rEmail').value.trim().toLowerCase();
      const users = store.get(KEYS.users, {});
      users[email] = name;               // solo se guarda nombre/correo, nunca contraseñas
      store.set(KEYS.users, users);
      auth.registerForm.reset();
      completeLogin({ name, email });
    });

    // Mostrar / ocultar contraseña
    $$('.pw-toggle').forEach((btn) => btn.addEventListener('click', () => {
      const input = byId(btn.dataset.pw);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      btn.firstElementChild.className = show ? 'ph ph-eye-slash' : 'ph ph-eye';
    }));

    // Si el modal se cierra sin autenticarse, se descarta la acción pendiente
    els.authDialog.addEventListener('close', () => { state.pending = null; });

    // El ícono de perfil es uno de los dos únicos disparadores del modal
    els.profileBtn.addEventListener('click', () => openAuth());
    byId('logoutBtn').addEventListener('click', logout);
    byId('userCartBtn').addEventListener('click', openCart);
  }

  /* -----------------------------------------------------------------------
     CARRITO
     ----------------------------------------------------------------------- */
  const cartEls = {
    list: byId('cartList'),
    empty: byId('cartEmpty'),
    foot: byId('cartFoot'),
    selectRow: byId('cartSelectRow'),
    selectAll: byId('selectAll'),
    subtitle: byId('cartSubtitle'),
    selCount: byId('selCount'),
    subtotal: byId('cartSubtotal'),
    total: byId('cartTotal'),
    checkout: byId('checkoutBtn'),
  };

  // Cada usuario tiene su carrito; sin sesión el carrito está vacío
  const cartKey = () => (state.user ? KEYS.cart + state.user.email : null);
  function loadCart() {
    const key = cartKey();
    if (!key) return [];
    const saved = store.get(key, []);
    return Array.isArray(saved)
      ? saved
          .filter((it) => findProduct(it.id))
          .map((it) => ({ id: Number(it.id), qty: Math.min(MAX_QTY, Math.max(1, Number(it.qty) || 1)), checked: it.checked !== false }))
      : [];
  }
  function saveCart() {
    const key = cartKey();
    if (key) store.set(key, state.cart);
  }

  const selectedItems = () => state.cart.filter((it) => it.checked);
  const sumOf = (items) => items.reduce((acc, it) => acc + findProduct(it.id).price * it.qty, 0);
  const unitsOf = (items) => items.reduce((acc, it) => acc + it.qty, 0);

  function addToCart(id) {
    const existing = state.cart.find((it) => it.id === Number(id));
    if (existing) {
      if (existing.qty >= MAX_QTY) { toast(`Máximo ${MAX_QTY} unidades por producto`, { icon: 'ph-warning-circle', error: true }); return; }
      existing.qty += 1;
      existing.checked = true;
    } else {
      state.cart.push({ id: Number(id), qty: 1, checked: true });
    }
    saveCart();
    renderCart(true);
  }

  function renderCart(bump = false) {
    const items = state.cart;
    const total = unitsOf(items);

    els.cartCount.textContent = String(total);
    els.cartCount.dataset.count = String(total);
    if (bump) {
      els.cartCount.classList.remove('bump');
      void els.cartCount.offsetWidth;      // reinicia la animación
      els.cartCount.classList.add('bump');
    }

    cartEls.list.innerHTML = items.map((it) => {
      const p = findProduct(it.id);
      return `
        <li class="cart-item ${it.checked ? 'is-selected' : ''}" data-id="${p.id}">
          <input type="checkbox" class="checkbox" data-action="toggle" ${it.checked ? 'checked' : ''} aria-label="Seleccionar ${esc(p.name)}">
          <img src="${img(p.img, 160, 160)}" alt="" width="74" height="74" loading="lazy" decoding="async">
          <div class="cart-item__info">
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.brand)} · ${esc(p.category)}</p>
            <strong>${formatPrice(p.price * it.qty)}</strong>
          </div>
          <div class="cart-item__side">
            <div class="qty" role="group" aria-label="Cantidad de ${esc(p.name)}">
              <button type="button" data-action="dec" aria-label="Disminuir cantidad" ${it.qty <= 1 ? 'disabled' : ''}><i class="ph ph-minus" aria-hidden="true"></i></button>
              <output aria-live="polite">${it.qty}</output>
              <button type="button" data-action="inc" aria-label="Aumentar cantidad" ${it.qty >= MAX_QTY ? 'disabled' : ''}><i class="ph ph-plus" aria-hidden="true"></i></button>
            </div>
            <button type="button" class="remove-btn" data-action="remove" aria-label="Eliminar ${esc(p.name)}"><i class="ph ph-trash" aria-hidden="true"></i></button>
          </div>
        </li>`;
    }).join('');

    const hasItems = items.length > 0;
    cartEls.list.hidden = !hasItems;
    cartEls.selectRow.hidden = !hasItems;
    cartEls.foot.hidden = !hasItems;
    cartEls.empty.hidden = hasItems;
    cartEls.subtitle.textContent = hasItems
      ? `${total} ${total === 1 ? 'producto' : 'productos'}`
      : 'Sin productos';

    const selected = selectedItems();
    const sum = sumOf(selected);
    cartEls.selCount.textContent = String(unitsOf(selected));
    cartEls.subtotal.textContent = formatPrice(sum);
    cartEls.total.textContent = formatPrice(sum);
    cartEls.checkout.disabled = selected.length === 0;

    cartEls.selectAll.checked = hasItems && selected.length === items.length;
    cartEls.selectAll.indeterminate = selected.length > 0 && selected.length < items.length;
  }

  function openCart() { openDialog(els.cartDialog); }

  function initCart() {
    state.cart = loadCart();
    renderCart();

    // Abrir el carrito no requiere sesión (sin sesión simplemente está vacío)
    els.cartBtn.addEventListener('click', openCart);

    cartEls.list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.type === 'checkbox') return;
      const id = Number(btn.closest('.cart-item').dataset.id);
      const item = state.cart.find((it) => it.id === id);
      if (!item) return;
      if (btn.dataset.action === 'inc') item.qty = Math.min(MAX_QTY, item.qty + 1);
      if (btn.dataset.action === 'dec') item.qty = Math.max(1, item.qty - 1);
      if (btn.dataset.action === 'remove') state.cart = state.cart.filter((it) => it.id !== id);
      saveCart();
      renderCart();
    });

    cartEls.list.addEventListener('change', (e) => {
      if (e.target.dataset.action !== 'toggle') return;
      const id = Number(e.target.closest('.cart-item').dataset.id);
      const item = state.cart.find((it) => it.id === id);
      if (item) item.checked = e.target.checked;
      saveCart();
      renderCart();
    });

    cartEls.selectAll.addEventListener('change', () => {
      state.cart.forEach((it) => { it.checked = cartEls.selectAll.checked; });
      saveCart();
      renderCart();
    });

    byId('cartBrowse').addEventListener('click', () => {
      els.cartDialog.close();
      byId('productos').scrollIntoView({ behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
    });

    cartEls.checkout.addEventListener('click', () => {
      if (selectedItems().length === 0) return;
      requireAuth(startPayment);
    });
  }

  /** Delegación global: cualquier botón "COMPRAR" / "Añadir al carrito" exige sesión */
  function initBuyButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-buy]');
      if (!btn) return;
      const id = Number(btn.dataset.buy);
      const product = findProduct(id);
      if (!product) return;
      requireAuth(() => {
        addToCart(id);
        toast(`${product.name} añadido al carrito`, { icon: 'ph-shopping-cart-simple' });
        openCart();
      });
    });
  }

  /* -----------------------------------------------------------------------
     PASARELA DE PAGO (simulada)
     ----------------------------------------------------------------------- */
  const pay = {
    flow: byId('payFlow'),
    success: byId('paySuccess'),
    form: byId('payForm'),
    btn: byId('payBtn'),
    panels: $$('[data-panel]'),
    phoneField: byId('phoneField'),
    phone: byId('pPhone'),
    method: 'wallet',
  };

  // QR decorativo determinista (no es un QR real)
  function buildQR(seed) {
    const n = 25;
    let s = seed >>> 0 || 1;
    const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const inFinder = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!inFinder(x, y) && rand() > 0.52) d += `M${x} ${y}h1v1h-1z`;
    }
    const finder = (ox, oy) =>
      `<rect x="${ox + .5}" y="${oy + .5}" width="6" height="6" fill="none" stroke="#0e1220" stroke-width="1"/>` +
      `<rect x="${ox + 2}" y="${oy + 2}" width="3" height="3" fill="#0e1220"/>`;
    return `<svg viewBox="0 0 ${n} ${n}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
      <path d="${d}" fill="#0e1220"/>${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
  }

  function setMethod(method) {
    pay.method = method;
    pay.panels.forEach((panel) => {
      const active = panel.dataset.panel === method;
      panel.hidden = !active;
      // Los campos ocultos se desactivan para no bloquear la validación del formulario
      $$('input', panel).forEach((input) => { input.disabled = !active; });
    });
    if (method === 'wallet') syncWallet();
    const labels = { wallet: 'Pagar con billetera', qr: 'Ya realicé el pago', card: 'Pagar con tarjeta' };
    $('span', pay.btn).textContent = `${labels[method]} · ${byId('payTotal').textContent}`;
  }

  function syncWallet() {
    const wallet = $('input[name="wallet"]:checked', pay.form).value;
    const needsPhone = wallet === 'yape' || wallet === 'plin';
    pay.phoneField.hidden = !needsPhone;
    pay.phone.disabled = !needsPhone || pay.method !== 'wallet';
  }

  function startPayment() {
    const items = selectedItems();
    if (!items.length) return;
    const total = sumOf(items);
    const units = unitsOf(items);

    byId('payItems').textContent = `${units} ${units === 1 ? 'producto' : 'productos'}`;
    byId('payTotal').textContent = formatPrice(total);
    byId('qrBox').innerHTML = buildQR(total);

    pay.flow.hidden = false;
    pay.success.hidden = true;
    pay.form.reset();
    pay.btn.disabled = false;
    $$('input[name="method"]')[0].checked = true;
    ['cpNum', 'cpName', 'cpExp'].forEach((id) => { byId(id).textContent = { cpNum: '•••• •••• •••• ••••', cpName: 'NOMBRE APELLIDO', cpExp: 'MM/AA' }[id]; });
    setMethod('wallet');
    openDialog(els.payDialog);
  }

  function initPayment() {
    $$('input[name="method"]').forEach((r) => r.addEventListener('change', () => setMethod(r.value)));
    $$('input[name="wallet"]').forEach((r) => r.addEventListener('change', syncWallet));

    // Formato de campos
    pay.phone.addEventListener('input', () => { pay.phone.value = pay.phone.value.replace(/\D/g, '').slice(0, 9); });

    const num = byId('cNumber');
    num.addEventListener('input', () => {
      const digits = num.value.replace(/\D/g, '').slice(0, 16);
      num.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
      byId('cpNum').textContent = (digits.padEnd(16, '•')).replace(/(.{4})(?=.)/g, '$1 ');
    });
    const holder = byId('cHolder');
    holder.addEventListener('input', () => { byId('cpName').textContent = holder.value.toUpperCase() || 'NOMBRE APELLIDO'; });
    const exp = byId('cExp');
    exp.addEventListener('input', () => {
      let v = exp.value.replace(/\D/g, '').slice(0, 4);
      if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`;
      exp.value = v;
      byId('cpExp').textContent = v || 'MM/AA';
    });
    const cvv = byId('cCvv');
    cvv.addEventListener('input', () => { cvv.value = cvv.value.replace(/\D/g, '').slice(0, 4); });

    pay.form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (pay.method === 'card') {
        if (num.value.replace(/\s/g, '').length !== 16) {
          num.setCustomValidity('Ingresa los 16 dígitos de tu tarjeta');
          num.reportValidity();
          num.addEventListener('input', () => num.setCustomValidity(''), { once: true });
          return;
        }
      }

      pay.btn.disabled = true;
      const label = $('span', pay.btn);
      const icon = $('i', pay.btn);
      const prev = label.textContent;
      label.textContent = 'Procesando pago…';
      icon.className = 'ph ph-spinner spin';

      setTimeout(() => {
        const paid = new Set(selectedItems().map((it) => it.id));
        state.cart = state.cart.filter((it) => !paid.has(it.id));
        saveCart();
        renderCart();

        byId('orderNumber').textContent = `NX-${Math.floor(100000 + Math.random() * 900000)}`;
        pay.flow.hidden = true;
        pay.success.hidden = false;
        label.textContent = prev;
        icon.className = 'ph ph-lock-key';
        pay.form.reset();
      }, 1500);
    });
  }

  /* -----------------------------------------------------------------------
     FORMULARIO DE CONSULTAS
     ----------------------------------------------------------------------- */
  function initContact() {
    const form = byId('contactForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.elements.name.value.trim().split(' ')[0];
      form.reset();
      toast(`¡Gracias, ${name}! Te responderemos en menos de 24 horas.`, { icon: 'ph-paper-plane-tilt' });
    });
  }

  /* -----------------------------------------------------------------------
     INICIO
     ----------------------------------------------------------------------- */
  function init() {
    if (byId('starImg')) renderHero();
    renderFeaturedProducts();
    if (byId('promoTrack')) renderPromos();
    if (els.filtersForm) {
      initFilters();
      renderProducts();
    }
    initNavigation();
    initAuth();
    updateAuthUI();
    initCart();
    initBuyButtons();
    initPayment();
    initContact();
    observeReveals();
  }

  init();
})();
