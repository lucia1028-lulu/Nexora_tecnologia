(function () {
  'use strict';

  const D = window.NEXORA_DATA;
  const UI = window.NEXORA_UI;
  if (!D || !UI) {
    console.error('Nexora: falta data-mock.js o layout.js');
    return;
  }

  const { db, onDataChange, MODULES, ACTIONS } = D;
  const { initLayout, $, $$, esc, toast, confirmDialog, openModal, closeModal } = UI;

  let ctx;

  document.addEventListener('DOMContentLoaded', () => {
    ctx = initLayout({ module: 'roles' });
    if (ctx) main();
  });

/* ==========================================================================
   NEXORA ADMIN · roles.js
   Gestión de roles (Administrador, Vendedor de Caja, Almacenero…) y matriz
   de permisos por módulo (ver / crear / editar / eliminar)
   ========================================================================== */
function main() {
  const ACTION_KEYS = Object.keys(ACTIONS);
  const state = { selected: ctx.user.roleId || db.all('roles')[0]?.id, draft: null, editingId: null };
  const dlg = $('#roleDialog');
  const form = $('#roleForm');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const role = () => db.get('roles', state.selected);
  const usersOf = (id) => db.all('users').filter((u) => u.type === 'Personal' && u.roleId === id);
  const isLocked = (r) => r.id === 'role_admin';   // el Administrador siempre tiene acceso total

  function ensureDraft() {
    const r = role();
    if (r && (!state.draft || state.draft.id !== r.id)) state.draft = { id: r.id, permissions: clone(r.permissions) };
  }
  const isDirty = () => {
    const r = role();
    return !!(r && state.draft && state.draft.id === r.id && JSON.stringify(state.draft.permissions) !== JSON.stringify(r.permissions));
  };

  /* ---------- Lista de roles ---------- */
  function renderList() {
    const roles = db.all('roles');
    $('#rolesCount').textContent = `${roles.length} roles definidos`;
    $('#roleList').innerHTML = roles.map((r) => {
      const n = usersOf(r.id).length;
      return `<li><button type="button" class="role-item" data-role="${r.id}" aria-current="${r.id === state.selected}">
        <span class="role-item__icon role-item__icon--${r.tone || 'neutral'}"><i class="ph-fill ${r.id === 'role_admin' ? 'ph-crown' : 'ph-shield-check'}" aria-hidden="true"></i></span>
        <b>${esc(r.name)}</b>
        <span class="badge badge--${r.system ? 'primary' : 'neutral'}">${n} ${n === 1 ? 'usuario' : 'usuarios'}</span>
        <small>${esc(r.description || 'Sin descripción')}</small></button></li>`;
    }).join('');
  }

  /* ---------- Matriz ---------- */
  function renderMatrix() {
    const r = role();
    if (!r) return;
    ensureDraft();
    const locked = isLocked(r);
    const editable = ctx.can('edit') && !locked;
    $('#roleName').textContent = r.name;
    $('#roleDesc').textContent = r.description || '';
    $('#deleteRole').disabled = r.system || usersOf(r.id).length > 0 || locked;
    $('#deleteRole').title = locked || r.system ? 'Los roles del sistema no se pueden eliminar' : usersOf(r.id).length ? 'Reasigna a sus usuarios antes de eliminarlo' : 'Eliminar rol';
    const note = $('#roleNote');
    note.hidden = !locked && editable;
    note.innerHTML = locked
      ? '<i class="ph-fill ph-crown" aria-hidden="true"></i> El rol Administrador siempre conserva acceso total y no se puede modificar.'
      : !ctx.can('edit') ? '<i class="ph-fill ph-lock-key" aria-hidden="true"></i> Tu rol solo permite consultar los permisos.' : '';

    const perms = state.draft.permissions;
    const head = `<thead><tr><th scope="col">Módulo</th>${ACTION_KEYS.map((a) => `<th scope="col"><label class="check"><input type="checkbox" data-col="${a}" ${editable ? '' : 'disabled'} aria-label="Marcar todos: ${ACTIONS[a]}"> ${ACTIONS[a]}</label></th>`).join('')}<th scope="col">Todo</th></tr></thead>`;
    const body = MODULES.map((m) => {
      const note = Object.entries(m.labels || {}).map(([a, l]) => `${ACTIONS[a]} = ${l}`).join(' · ');
      return `<tr><th scope="row" class="mod-cell-th"><div class="mod-cell"><i class="ph ${m.icon}" aria-hidden="true"></i><div><b>${esc(m.label)}</b><small>${esc(note || m.group)}</small></div></div></th>
        ${ACTION_KEYS.map((a) => m.actions.includes(a)
          ? `<td><label class="check"><input type="checkbox" data-m="${m.key}" data-a="${a}" ${perms[m.key]?.[a] ? 'checked' : ''} ${editable ? '' : 'disabled'} aria-label="${ACTIONS[a]} en ${esc(m.label)}"></label></td>`
          : '<td><span class="na" aria-hidden="true">—</span></td>').join('')}
        <td><label class="check"><input type="checkbox" data-row="${m.key}" ${editable ? '' : 'disabled'} aria-label="Todos los permisos de ${esc(m.label)}"></label></td></tr>`;
    }).join('');
    $('#matrix').innerHTML = head + `<tbody>${body}</tbody>`;
    syncAggregates();
    $('#matrixFoot').hidden = !isDirty();
  }

  /** Estados "todo / parcial" de filas y columnas. */
  function syncAggregates() {
    const perms = state.draft.permissions;
    MODULES.forEach((m) => {
      const cb = $(`[data-row="${m.key}"]`);
      if (!cb) return;
      const on = m.actions.filter((a) => perms[m.key]?.[a]).length;
      cb.checked = on === m.actions.length;
      cb.indeterminate = on > 0 && on < m.actions.length;
    });
    ACTION_KEYS.forEach((a) => {
      const cb = $(`[data-col="${a}"]`);
      if (!cb) return;
      const mods = MODULES.filter((m) => m.actions.includes(a));
      const on = mods.filter((m) => perms[m.key]?.[a]).length;
      cb.checked = on === mods.length;
      cb.indeterminate = on > 0 && on < mods.length;
    });
  }

  function setPerm(mod, action, value) {
    const p = state.draft.permissions[mod];
    p[action] = value;
    if (action === 'view' && !value) ACTION_KEYS.forEach((a) => { p[a] = false; });   // sin "ver" no hay otras acciones
    if (action !== 'view' && value) p.view = true;                                     // cualquier acción requiere "ver"
  }

  $('#matrix').addEventListener('change', (e) => {
    const cb = e.target;
    if (!ctx.guard('edit')) { renderMatrix(); return; }
    if (cb.dataset.m) setPerm(cb.dataset.m, cb.dataset.a, cb.checked);
    else if (cb.dataset.row) {
      const m = MODULES.find((x) => x.key === cb.dataset.row);
      m.actions.forEach((a) => setPerm(m.key, a, cb.checked));
    } else if (cb.dataset.col) {
      MODULES.filter((m) => m.actions.includes(cb.dataset.col)).forEach((m) => setPerm(m.key, cb.dataset.col, cb.checked));
    }
    renderMatrix();
    $(`#matrix ${cb.dataset.m ? `[data-m="${cb.dataset.m}"][data-a="${cb.dataset.a}"]` : cb.dataset.row ? `[data-row="${cb.dataset.row}"]` : `[data-col="${cb.dataset.col}"]`}`)?.focus();
  });

  $('#savePerms').addEventListener('click', () => {
    if (!ctx.guard('edit')) return;
    const r = role();
    const own = r.id === ctx.user.roleId;
    if (own && (!state.draft.permissions.roles.view || !state.draft.permissions.roles.edit)) {
      toast('No puedes quitarte el acceso a Roles en tu propio rol (te bloquearías).', 'error');
      return;
    }
    db.update('roles', r.id, { permissions: clone(state.draft.permissions) });
    toast(`Permisos de "${r.name}" guardados.`);
    if (own) setTimeout(() => location.reload(), 900);   // aplica el nuevo menú de inmediato
  });
  $('#discard').addEventListener('click', () => { state.draft = null; renderMatrix(); toast('Cambios descartados.', 'info'); });

  /* ---------- Selección de rol ---------- */
  $('#roleList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-role]');
    if (!b || b.dataset.role === state.selected) return;
    if (isDirty()) {
      const ok = await confirmDialog({ title: 'Cambios sin guardar', message: 'Si cambias de rol perderás las modificaciones de permisos.', confirmText: 'Descartar y cambiar' });
      if (!ok) return;
    }
    state.selected = b.dataset.role; state.draft = null;
    renderList(); renderMatrix();
  });

  /* ---------- Crear / editar / eliminar rol ---------- */
  function validateName() {
    const name = $('#rName').value.trim().toLowerCase();
    const dup = name && db.all('roles').find((r) => r.name.toLowerCase() === name && r.id !== state.editingId);
    $('#rName').setCustomValidity(dup ? 'Ya existe un rol con ese nombre' : '');
    $('#rNameHint').textContent = dup ? 'Ya existe un rol con ese nombre.' : '';
  }
  $('#rName').addEventListener('input', validateName);

  function openForm(id) {
    if (!ctx.guard(id ? 'edit' : 'create')) return;
    state.editingId = id;
    form.reset();
    const r = id ? db.get('roles', id) : null;
    $('#rdTitle').textContent = r ? 'Editar rol' : 'Nuevo rol';
    $('#rdSave').textContent = r ? 'Guardar cambios' : 'Crear rol';
    $('#rName').value = r?.name || '';
    $('#rDesc').value = r?.description || '';
    $('#copyField').hidden = !!r;
    $('#rCopy').innerHTML = '<option value="">Sin permisos (vacío)</option>' + db.all('roles').map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    $('#rName').disabled = !!(r && r.system);
    validateName();
    openModal(dlg);
    $('#rName').focus();
  }
  $('#newRole').addEventListener('click', () => openForm(null));
  $('#editRole').addEventListener('click', () => { if (!isLocked(role())) openForm(state.selected); else toast('El rol Administrador no se puede editar.', 'info'); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const editing = state.editingId;
    if (!ctx.guard(editing ? 'edit' : 'create')) return;
    validateName();
    if (!form.reportValidity()) return;
    const name = $('#rName').value.trim().replace(/\s+/g, ' ');
    const description = $('#rDesc').value.trim();
    if (editing) {
      const r = db.get('roles', editing);
      db.update('roles', editing, { name: r.system ? r.name : name, description });
      toast('Rol actualizado.');
    } else {
      const src = db.get('roles', $('#rCopy').value);
      const empty = Object.fromEntries(MODULES.map((m) => [m.key, { view: false, create: false, edit: false, delete: false }]));
      const id = `role_${Date.now().toString(36)}`;
      db.insert('roles', { id, name, description, system: false, tone: 'neutral', permissions: src ? clone(src.permissions) : empty });
      state.selected = id; state.draft = null;
      toast(`Rol creado: ${name}`);
    }
    closeModal(dlg);
  });

  $('#deleteRole').addEventListener('click', async () => {
    if (!ctx.guard('delete')) return;
    const r = role();
    if (r.system || isLocked(r)) { toast('Los roles del sistema no se pueden eliminar.', 'error'); return; }
    if (usersOf(r.id).length) { toast('Reasigna a los usuarios de este rol antes de eliminarlo.', 'error'); return; }
    const ok = await confirmDialog({ title: `¿Eliminar el rol "${r.name}"?`, message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    db.remove('roles', r.id);
    state.selected = 'role_admin'; state.draft = null;
    toast('Rol eliminado.');
  });

  function render() {
    if (!role()) state.selected = db.all('roles')[0]?.id;
    renderList();
    if (!isDirty()) state.draft = null;   // si no hay cambios locales, se refresca con los datos más recientes
    renderMatrix();
  }
  render();
  onDataChange(render);
}

})();
