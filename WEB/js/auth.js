/* ==========================================================================
   NEXORA · js/auth.js
   Autenticación de la tienda (simulada en el navegador con localStorage):
   - login.html: inicio de sesión con validación de credenciales
   - registro.html: creación de cuenta con datos personales y dirección
   - Todas las páginas: navbar con nombre/perfil, menú de cuenta y cierre de sesión

   Claves de localStorage
     nexora.users             → { [correo]: { name, phone, ..., salt, hash } }
     nexora.session           → { name, email }
     nexora.rememberedEmail   → correo recordado en login
     nexora.returnUrl         → página a la que volver tras autenticarse
   ========================================================================== */
'use strict';

(() => {
  const KEYS = {
    users: 'nexora.users',
    session: 'nexora.session',
    remembered: 'nexora.rememberedEmail',
    returnUrl: 'nexora.returnUrl',
  };

  /* -----------------------------------------------------------------------
     UTILIDADES
     ----------------------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const byId = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';

  const store = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; }
    },
    /** Devuelve false si el navegador no permite guardar (modo privado, cuota, etc.). */
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch { /* noop */ } },
  };

  const titleCase = (s) => s.replace(/[._-]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const firstName = (name) => String(name).trim().split(/\s+/)[0] || 'Cliente';
  const initialOf = (name) => (String(name).trim()[0] || 'U').toUpperCase();

  /** Solo se admite volver a páginas internas del sitio (evita redirecciones abiertas). */
  function safeReturnUrl() {
    const url = store.get(KEYS.returnUrl, null);
    return typeof url === 'string' && /^[a-z0-9_-]+\.html$/i.test(url) && !/^(login|registro)\.html$/i.test(url) ? url : 'index.html';
  }

  /* -----------------------------------------------------------------------
     SESIÓN Y USUARIOS
     ----------------------------------------------------------------------- */
  function getSession() {
    const s = store.get(KEYS.session, null);
    return s && typeof s.email === 'string' && typeof s.name === 'string' ? s : null;
  }

  function readUsers() {
    const users = store.get(KEYS.users, {});
    return users && typeof users === 'object' && !Array.isArray(users) ? users : {};
  }

  /** Guarda la sesión y vuelve a la página desde la que se pidió autenticarse. */
  function startSession(user) {
    if (!store.set(KEYS.session, { name: user.name, email: user.email })) return false;
    const destination = safeReturnUrl();
    store.remove(KEYS.returnUrl);
    window.location.assign(destination);
    return true;
  }

  function endSession() {
    store.remove(KEYS.session);
    window.location.reload();
  }

  /* -----------------------------------------------------------------------
     CONTRASEÑAS (demo): SHA-256 con sal por usuario. Nunca se guarda el texto plano.
     Nota: en un sistema real esto debe hacerse en el servidor.
     ----------------------------------------------------------------------- */
  function randomSalt() {
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(password, salt) {
    const input = `${salt}:${password}`;
    if (window.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Alternativa no criptográfica para contextos sin Web Crypto (p. ej. http fuera de localhost)
    let h = 5381;
    for (const ch of input) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
    return `x${h.toString(16)}`;
  }

  /* -----------------------------------------------------------------------
     NAVBAR: nombre/perfil + menú de cuenta (todas las páginas)
     ----------------------------------------------------------------------- */
  let menuEl = null;

  function triggers() {
    return [byId('profileBtn'), $('[data-auth-link]')].filter(Boolean);
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (!menuEl || menuEl.hidden) return;
    menuEl.hidden = true;
    triggers().forEach((t) => t.setAttribute('aria-expanded', 'false'));
    if (restoreFocus) (byId('profileBtn') || $('[data-auth-link]'))?.focus();
  }

  function openMenu() {
    if (!menuEl) return;
    menuEl.hidden = false;
    triggers().forEach((t) => t.setAttribute('aria-expanded', 'true'));
    $('a, button', menuEl)?.focus();
  }

  function buildMenu(session) {
    const host = $('.header-actions') || $('.header-inner');
    if (!host) return;
    menuEl = document.createElement('div');
    menuEl.className = 'account-menu';
    menuEl.id = 'accountMenu';
    menuEl.hidden = true;
    menuEl.setAttribute('role', 'menu');
    menuEl.setAttribute('aria-label', 'Cuenta de usuario');
    menuEl.innerHTML = `
      <div class="account-menu__head">
        <span class="avatar" aria-hidden="true">${esc(initialOf(session.name))}</span>
        <div><b>${esc(session.name)}</b><small>${esc(session.email)}</small></div>
      </div>
      <a role="menuitem" href="productos.html"><i class="ph ph-storefront" aria-hidden="true"></i> Seguir comprando</a>
      ${byId('cartBtn') ? '<button type="button" role="menuitem" data-account="cart"><i class="ph ph-shopping-cart-simple" aria-hidden="true"></i> Mi carrito</button>' : ''}
      <button type="button" role="menuitem" class="is-danger" data-account="logout"><i class="ph ph-sign-out" aria-hidden="true"></i> Cerrar sesión</button>`;
    host.append(menuEl);

    menuEl.addEventListener('click', (e) => {
      const action = e.target.closest('[data-account]')?.dataset.account;
      if (action === 'logout') endSession();
      if (action === 'cart') { closeMenu(); byId('cartBtn')?.click(); }
    });
    document.addEventListener('click', (e) => {
      if (menuEl.hidden) return;
      if (!e.target.closest('#accountMenu') && !e.target.closest('#profileBtn') && !e.target.closest('[data-auth-link]')) closeMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu({ restoreFocus: true }); });
  }

  /** Redirige a login.html recordando la página actual. */
  function goToLogin() {
    store.set(KEYS.returnUrl, currentPage());
    window.location.assign('login.html');
  }

  function initNavbar() {
    const session = getSession();
    const link = $('[data-auth-link]');
    const profileBtn = byId('profileBtn');

    if (session) {
      buildMenu(session);
      if (link) {
        link.innerHTML = `<i class="ph ph-user-circle" aria-hidden="true"></i> ${esc(firstName(session.name))}`;
        link.setAttribute('href', '#');
        link.setAttribute('role', 'button');
        link.setAttribute('aria-haspopup', 'menu');
        link.setAttribute('aria-expanded', 'false');
        link.setAttribute('aria-controls', 'accountMenu');
        link.classList.add('nav__link--user');
        link.removeAttribute('aria-current');
      }
      if (profileBtn) {
        profileBtn.innerHTML = `<span class="avatar" aria-hidden="true">${esc(initialOf(session.name))}</span>`;
        profileBtn.setAttribute('aria-label', `Perfil de ${session.name}`);
        profileBtn.setAttribute('aria-haspopup', 'menu');
        profileBtn.setAttribute('aria-expanded', 'false');
        profileBtn.setAttribute('aria-controls', 'accountMenu');
      }
    }

    const toggle = (e) => {
      e.preventDefault();
      if (!session) { goToLogin(); return; }
      menuEl.hidden ? openMenu() : closeMenu();
    };
    // El enlace "Iniciar sesión" solo actúa como menú cuando hay sesión; si no, navega a login.html
    if (link && session) link.addEventListener('click', toggle);
    if (profileBtn) profileBtn.addEventListener('click', toggle);
  }

  /** Menú móvil en las páginas de acceso (el resto lo gestiona app.js). */
  function initAuthPageMenu() {
    const nav = byId('mainNav');
    const toggle = byId('menuToggle');
    if (!nav || !toggle) return;
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      toggle.firstElementChild.className = open ? 'ph ph-x' : 'ph ph-list';
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }

  /* -----------------------------------------------------------------------
     COMPONENTES COMUNES DE LOS FORMULARIOS
     ----------------------------------------------------------------------- */
  function showMessage(el, text, state = 'error') {
    if (!el) return;
    el.textContent = text;
    el.dataset.state = state;
    el.hidden = !text;
  }

  function initPasswordToggles() {
    $$('[data-password-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = byId(button.dataset.passwordToggle);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
        button.firstElementChild.className = show ? 'ph ph-eye-slash' : 'ph ph-eye';
      });
    });
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.innerHTML;
      button.innerHTML = `<i class="ph ph-spinner spin" aria-hidden="true"></i> ${busyText}`;
    } else if (button.dataset.label) {
      button.innerHTML = button.dataset.label;
    }
    button.disabled = busy;
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* -----------------------------------------------------------------------
     LOGIN
     ----------------------------------------------------------------------- */
  function initLogin() {
    const form = byId('loginForm');
    if (!form) return;
    if (getSession()) { window.location.replace(safeReturnUrl()); return; }

    const email = byId('loginEmail');
    const password = byId('loginPassword');
    const remember = byId('rememberEmail');
    const message = byId('authMessage');
    const submit = $('[type="submit"]', form);

    // Mensaje contextual si se llegó desde un botón de compra o desde el perfil
    if (store.get(KEYS.returnUrl, null)) showMessage(message, 'Inicia sesión para continuar con tu compra.', 'info');

    const savedEmail = store.get(KEYS.remembered, '');
    if (typeof savedEmail === 'string' && savedEmail) { email.value = savedEmail; remember.checked = true; password.focus(); }

    byId('forgotPassword')?.addEventListener('click', (e) => {
      e.preventDefault();
      showMessage(message, 'La recuperación de contraseña no está disponible en esta versión de demostración.', 'info');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showMessage(message, '');
      const key = email.value.trim().toLowerCase();
      if (!EMAIL_RE.test(key)) { showMessage(message, 'Ingresa un correo electrónico válido.'); email.focus(); return; }
      if (password.value.length < 6) { showMessage(message, 'La contraseña debe tener al menos 6 caracteres.'); password.focus(); return; }

      setBusy(submit, true, 'Ingresando…');
      try {
        const users = readUsers();
        let record = users[key];

        // Cuentas creadas con una versión anterior (solo guardaban el nombre): se completan con esta contraseña
        if (typeof record === 'string') {
          const salt = randomSalt();
          record = { name: record.trim() || titleCase(key.split('@')[0]), email: key, salt, hash: await hashPassword(password.value, salt) };
          users[key] = record;
          store.set(KEYS.users, users);
        }

        const valid = record && record.salt && record.hash && (await hashPassword(password.value, record.salt)) === record.hash;
        if (!valid) {
          showMessage(message, 'Correo o contraseña incorrectos. Si aún no tienes cuenta, regístrate.');
          setBusy(submit, false);
          return;
        }

        if (remember.checked) store.set(KEYS.remembered, key); else store.remove(KEYS.remembered);
        if (!startSession({ name: record.name, email: key })) throw new Error('storage');
      } catch {
        showMessage(message, 'No se pudo iniciar sesión. Revisa el almacenamiento del navegador e inténtalo nuevamente.');
        setBusy(submit, false);
      }
    });
  }

  /* -----------------------------------------------------------------------
     REGISTRO
     ----------------------------------------------------------------------- */
  function initRegister() {
    const form = byId('registerForm');
    if (!form) return;
    if (getSession()) { window.location.replace(safeReturnUrl()); return; }

    const F = {
      name: byId('registerName'), phone: byId('registerPhone'), email: byId('registerEmail'), birth: byId('registerBirth'),
      docType: byId('registerDocType'), docNumber: byId('registerDocNumber'),
      department: byId('registerDepartment'), province: byId('registerProvince'), district: byId('registerDistrict'), address: byId('registerAddress'),
      password: byId('registerPassword'), confirm: byId('registerConfirm'), terms: byId('registerTerms'),
    };
    const message = byId('authMessage');
    const docHelp = byId('docHelp');
    const submit = $('[type="submit"]', form);

    // Fecha de nacimiento: no puede ser futura
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    F.birth.max = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    F.birth.min = '1900-01-01';

    // Teléfono: solo dígitos, máximo 9
    F.phone.addEventListener('input', () => { F.phone.value = F.phone.value.replace(/\D/g, '').slice(0, 9); });

    /* Documento: el número se habilita al elegir un tipo */
    const DOCS = {
      DNI: { re: /^\d{8}$/, max: 8, placeholder: '8 dígitos', help: 'El DNI tiene 8 dígitos.', clean: (v) => v.replace(/\D/g, '') },
      CE: { re: /^[A-Za-z0-9]{9,12}$/, max: 12, placeholder: '9 a 12 caracteres', help: 'El carnet de extranjería tiene entre 9 y 12 caracteres.', clean: (v) => v.replace(/[^A-Za-z0-9]/g, '') },
      PAS: { re: /^[A-Za-z0-9]{6,12}$/, max: 12, placeholder: '6 a 12 caracteres', help: 'El pasaporte tiene entre 6 y 12 caracteres.', clean: (v) => v.replace(/[^A-Za-z0-9]/g, '') },
    };
    const syncDoc = () => {
      const doc = DOCS[F.docType.value];
      F.docNumber.disabled = !doc;
      F.docNumber.required = !!doc;
      F.docNumber.maxLength = doc ? doc.max : 20;
      F.docNumber.placeholder = doc ? doc.placeholder : 'Número de documento';
      F.docNumber.inputMode = F.docType.value === 'DNI' ? 'numeric' : 'text';
      if (!doc) F.docNumber.value = '';
      else F.docNumber.value = doc.clean(F.docNumber.value).slice(0, doc.max);
      docHelp.textContent = doc ? doc.help : 'Puedes dejar estos datos vacíos. Si agregas un documento, completa su tipo y número.';
    };
    F.docType.addEventListener('change', () => { syncDoc(); if (!F.docNumber.disabled) F.docNumber.focus(); });
    F.docNumber.addEventListener('input', () => {
      const doc = DOCS[F.docType.value];
      if (doc) F.docNumber.value = doc.clean(F.docNumber.value).slice(0, doc.max);
    });
    syncDoc();

    /* Validadores: devuelven un mensaje de error o '' si el campo es válido */
    const PLACE_RE = /^[\p{L}][\p{L}\s.'’-]{1,39}$/u;
    const validators = [
      [F.name, () => (/^[\p{L}][\p{L}\s.'’-]{1,59}$/u.test(F.name.value.trim()) ? '' : 'Ingresa tu nombre completo (solo letras).')],
      [F.phone, () => (/^\d{9}$/.test(F.phone.value) ? '' : 'El teléfono debe tener exactamente 9 dígitos.')],
      [F.email, () => {
        const key = F.email.value.trim().toLowerCase();
        if (!EMAIL_RE.test(key)) return 'Ingresa un correo electrónico válido.';
        return readUsers()[key] ? 'Este correo ya está registrado. Inicia sesión.' : '';
      }],
      [F.birth, () => {
        if (!F.birth.value) return 'Selecciona tu fecha de nacimiento.';
        return F.birth.value > F.birth.max || F.birth.value < F.birth.min ? 'La fecha de nacimiento no es válida.' : '';
      }],
      [F.docNumber, () => {
        const doc = DOCS[F.docType.value];
        return doc && !doc.re.test(F.docNumber.value) ? doc.help : '';
      }],
      [F.department, () => (PLACE_RE.test(F.department.value.trim()) ? '' : 'Ingresa tu departamento.')],
      [F.province, () => (PLACE_RE.test(F.province.value.trim()) ? '' : 'Ingresa tu provincia.')],
      [F.district, () => (PLACE_RE.test(F.district.value.trim()) ? '' : 'Ingresa tu distrito.')],
      [F.address, () => (F.address.value.trim().length >= 5 ? '' : 'Ingresa tu dirección (calle o avenida y número).')],
      [F.password, () => (F.password.value.length >= 6 ? '' : 'La contraseña debe tener al menos 6 caracteres.')],
      [F.confirm, () => (F.confirm.value === F.password.value ? '' : 'Las contraseñas no coinciden.')],
      [F.terms, () => (F.terms.checked ? '' : 'Debes aceptar los términos para crear tu cuenta.')],
    ];
    validators.forEach(([el]) => {
      el.addEventListener('input', () => el.setCustomValidity(''));
      el.addEventListener('change', () => el.setCustomValidity(''));
    });
    F.password.addEventListener('input', () => F.confirm.setCustomValidity(''));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showMessage(message, '');

      for (const [el, check] of validators) {
        const error = check();
        el.setCustomValidity(error);
        if (error) { el.reportValidity(); el.focus(); return; }
      }

      setBusy(submit, true, 'Creando cuenta…');
      try {
        const users = readUsers();
        const email = F.email.value.trim().toLowerCase();
        const salt = randomSalt();
        const record = {
          name: F.name.value.trim().replace(/\s+/g, ' '),
          phone: F.phone.value,
          email,
          birthdate: F.birth.value,
          docType: F.docType.value,
          docNumber: F.docType.value ? F.docNumber.value : '',
          department: F.department.value.trim(),
          province: F.province.value.trim(),
          district: F.district.value.trim(),
          address: F.address.value.trim(),
          salt,
          hash: await hashPassword(F.password.value, salt),
          createdAt: new Date().toISOString(),
        };
        users[email] = record;
        if (!store.set(KEYS.users, users)) throw new Error('storage');
        if (!startSession({ name: record.name, email })) throw new Error('storage');
      } catch {
        showMessage(message, 'No se pudo crear la cuenta. Revisa el almacenamiento del navegador e inténtalo nuevamente.');
        setBusy(submit, false);
      }
    });
  }

  /* -----------------------------------------------------------------------
     INICIO
     ----------------------------------------------------------------------- */
  initNavbar();
  if (document.body.dataset.page === 'auth') initAuthPageMenu();
  initPasswordToggles();
  initLogin();
  initRegister();

  // API mínima para otros scripts de la tienda
  window.NexoraAuth = { getSession, logout: endSession };
})();
