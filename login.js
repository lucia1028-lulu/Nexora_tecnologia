'use strict';

(() => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const notice = document.getElementById('loginNotice');
  const nav = document.getElementById('mainNav');
  const menuToggle = document.getElementById('menuToggle');

  function showNotice(message, state) {
    notice.textContent = message;
    notice.dataset.state = state;
    notice.hidden = !message;
  }

  function selectTab(isLogin) {
    loginTab.setAttribute('aria-selected', String(isLogin));
    loginTab.tabIndex = isLogin ? 0 : -1;
    registerTab.setAttribute('aria-selected', String(!isLogin));
    registerTab.tabIndex = isLogin ? -1 : 0;
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    showNotice('', '');
  }

  function readUsers() {
    const raw = localStorage.getItem('nexora.users');
    const users = raw ? JSON.parse(raw) : {};
    if (!users || typeof users !== 'object' || Array.isArray(users)) {
      throw new Error('El registro de cuentas no tiene un formato válido.');
    }
    return users;
  }

  function saveSession(name, email) {
    localStorage.setItem('nexora.session', JSON.stringify({ name, email }));
    window.location.assign('index.html');
  }

  function nameFromEmail(email) {
    return email.split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  }

  loginTab.addEventListener('click', () => selectTab(true));
  registerTab.addEventListener('click', () => selectTab(false));

  [loginTab, registerTab].forEach((tab) => tab.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectTab(tab === loginTab);
      (tab === loginTab ? registerTab : loginTab).focus();
    }
  }));

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    try {
      const users = readUsers();
      const name = typeof users[email] === 'string' && users[email].trim()
        ? users[email]
        : nameFromEmail(email);
      saveSession(name, email);
    } catch {
      showNotice('No se pudo iniciar sesión. Revisa el almacenamiento del navegador e inténtalo nuevamente.', 'error');
    }
  });

  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim().toLowerCase();
    try {
      const users = readUsers();
      users[email] = name;
      localStorage.setItem('nexora.users', JSON.stringify(users));
      saveSession(name, email);
    } catch {
      showNotice('No se pudo crear la cuenta. Revisa el almacenamiento del navegador e inténtalo nuevamente.', 'error');
    }
  });

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      button.firstElementChild.className = show ? 'ph ph-eye-slash' : 'ph ph-eye';
    });
  });

  menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menuToggle.firstElementChild.className = open ? 'ph ph-x' : 'ph ph-list';
  });
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      nav.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
})();
