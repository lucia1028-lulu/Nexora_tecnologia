(function () {
  'use strict';

  const D = window.NEXORA_DATA;
  const UI = window.NEXORA_UI;
  if (!D || !UI) {
    console.error('Nexora: falta data-mock.js o layout.js');
    return;
  }

  const { db, onDataChange } = D;
  const { initLayout, $, $$, esc, norm, fmt, badge, avatar, emptyRow, toast, confirmDialog, openModal, closeModal, debounce } = UI;

  let ctx;

  document.addEventListener('DOMContentLoaded', () => {
    ctx = initLayout({ module: 'usuarios' });
    if (ctx) main();
  });

/* ==========================================================================
   NEXORA ADMIN · usuarios.js
   CRUD de usuarios del sistema (personal) y clientes, con asignación de roles
   ========================================================================== */
function main() {
  const state = { tab: 'Personal', q: '', role: '', status: '', editingId: null };
  const dlg = $('#userDialog');
  const form = $('#userForm');
  const F = { name: $('#uName'), email: $('#uEmail'), phone: $('#uPhone'), role: $('#uRoleSel'), status: $('#uStatusSel') };
  const isStaff = () => state.tab === 'Personal';

  const roleName = (id) => db.get('roles', id)?.name || 'Sin rol';
  const activeAdmins = () => db.all('users').filter((u) => u.type === 'Personal' && u.status === 'Activo' && u.roleId === 'role_admin');
  const isLastAdmin = (u) => u.type === 'Personal' && u.status === 'Activo' && u.roleId === 'role_admin' && activeAdmins().length <= 1;

  function customerStats(u) {
    const orders = db.all('orders').filter((o) => o.status !== 'Cancelado' && (o.customer.id === u.id || (o.customer.email && o.customer.email === u.email)));
    return { count: orders.length, total: orders.reduce((a, o) => a + o.total, 0) };
  }

  /* ---------- Render ---------- */
  function renderStats() {
    const users = db.all('users');
    const staff = users.filter((u) => u.type === 'Personal');
    const clients = users.filter((u) => u.type === 'Cliente');
    const withOrders = clients.filter((c) => customerStats(c).count > 0).length;
    $('#userStats').innerHTML = `
      <div class="user-stat"><span>Personal activo</span><b>${staff.filter((u) => u.status === 'Activo').length}</b><small>de ${staff.length} cuentas</small></div>
      <div class="user-stat"><span>Roles definidos</span><b>${db.all('roles').length}</b><small>${activeAdmins().length} administrador(es) activo(s)</small></div>
      <div class="user-stat"><span>Clientes registrados</span><b>${clients.length}</b><small>${clients.filter((u) => u.status === 'Activo').length} activos</small></div>
      <div class="user-stat"><span>Clientes con compras</span><b>${withOrders}</b><small>${clients.length ? Math.round((withOrders / clients.length) * 100) : 0}% del total</small></div>`;
    $('#cntPersonal').textContent = staff.length;
    $('#cntCliente').textContent = clients.length;
  }

  function renderFilters() {
    const sel = $('#uRole');
    const cur = sel.value;
    sel.hidden = !isStaff();
    sel.innerHTML = '<option value="">Todos los roles</option>' + db.all('roles').map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    sel.value = cur;
  }

  function renderTable() {
    const q = norm(state.q);
    const list = db.all('users').filter((u) => u.type === state.tab
      && (!state.status || u.status === state.status) && (!state.role || u.roleId === state.role)
      && (!q || norm(`${u.name} ${u.email} ${u.phone}`).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));

    $('#usersHead').innerHTML = isStaff()
      ? '<tr><th>Usuario</th><th>Rol</th><th>Teléfono</th><th>Último acceso</th><th>Estado</th><th class="col-actions">Acciones</th></tr>'
      : '<tr><th>Cliente</th><th>Teléfono</th><th class="num">Pedidos</th><th class="num">Total comprado</th><th>Registro</th><th>Estado</th><th class="col-actions">Acciones</th></tr>';
    const cols = isStaff() ? 6 : 7;

    $('#usersRows').innerHTML = list.length ? list.map((u) => {
      const me = u.id === ctx.user.id;
      const stat = isStaff() ? null : customerStats(u);
      const actions = `<div class="row-actions">
        ${ctx.can('edit') ? `<button type="button" class="row-btn" data-edit="${u.id}" aria-label="Editar ${esc(u.name)}" title="Editar"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>` : ''}
        ${ctx.can('delete') ? `<button type="button" class="row-btn row-btn--danger" data-delete="${u.id}" aria-label="Eliminar ${esc(u.name)}" title="${me ? 'No puedes eliminar tu propia cuenta' : 'Eliminar'}" ${me ? 'disabled' : ''}><i class="ph ph-trash" aria-hidden="true"></i></button>` : ''}</div>`;
      const who = `<div class="cell-user">${avatar(u.name)}<div><b>${esc(u.name)}${me ? ' <span class="badge badge--primary you">Tú</span>' : ''}</b><small>${esc(u.email)}</small></div></div>`;
      const statusCell = `<label class="status-toggle" style="display:inline-flex;align-items:center;gap:.5rem"><span class="switch"><input type="checkbox" data-toggle="${u.id}" ${u.status === 'Activo' ? 'checked' : ''} ${ctx.can('edit') ? '' : 'disabled'} aria-label="Cuenta activa: ${esc(u.name)}"><span></span></span>${badge(u.status, u.status === 'Activo' ? 'success' : 'neutral')}</label>`;
      return isStaff()
        ? `<tr class="${u.status === 'Inactivo' ? 'is-inactive' : ''}"><td>${who}</td>
            <td>${badge(roleName(u.roleId), db.get('roles', u.roleId)?.tone || 'neutral', 'ph-shield-check')}</td>
            <td class="muted">${esc(u.phone || '—')}</td><td class="muted">${fmt.relative(u.lastAccess)}</td><td>${statusCell}</td><td class="col-actions">${actions}</td></tr>`
        : `<tr class="${u.status === 'Inactivo' ? 'is-inactive' : ''}"><td>${who}</td><td class="muted">${esc(u.phone || '—')}</td>
            <td class="num">${stat.count}</td><td class="num"><span class="spent">${fmt.money(stat.total)}</span></td>
            <td class="muted">${fmt.date(u.createdAt)}</td><td>${statusCell}</td><td class="col-actions">${actions}</td></tr>`;
    }).join('') : emptyRow(cols, 'No se encontraron usuarios con esos filtros.', 'ph-users');
    $('#newUserLabel').textContent = isStaff() ? 'Nuevo usuario' : 'Nuevo cliente';
  }

  function render() { renderStats(); renderFilters(); renderTable(); }

  /* ---------- Pestañas y filtros ---------- */
  function setTab(name, focus = false) {
    state.tab = name; state.role = ''; state.q = ''; $('#uSearch').value = '';
    $$('#userTabs [role="tab"]').forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $('#usersPanel').setAttribute('aria-labelledby', `tab-${name}`);
    render();
  }
  $('#userTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) setTab(t.dataset.tab); });
  $('#userTabs').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') setTab(state.tab === 'Personal' ? 'Cliente' : 'Personal', true);
  });
  $('#uSearch').addEventListener('input', debounce((e) => { state.q = e.target.value; renderTable(); }, 150));
  $('#uRole').addEventListener('change', (e) => { state.role = e.target.value; renderTable(); });
  $('#uStatus').addEventListener('change', (e) => { state.status = e.target.value; renderTable(); });

  /* ---------- Acciones ---------- */
  $('#usersRows').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { openForm(ed.dataset.edit); return; }
    const del = e.target.closest('[data-delete]');
    if (!del) return;
    if (!ctx.guard('delete')) return;
    const u = db.get('users', del.dataset.delete);
    if (u.id === ctx.user.id) { toast('No puedes eliminar tu propia cuenta.', 'error'); return; }
    if (isLastAdmin(u)) { toast('No puedes eliminar al único administrador activo.', 'error'); return; }
    const ok = await confirmDialog({ title: `¿Eliminar a ${u.name}?`, message: u.type === 'Cliente' ? 'Sus pedidos anteriores se conservan en el historial.' : 'Perderá el acceso al panel de inmediato.', confirmText: 'Eliminar', danger: true });
    if (ok) { db.remove('users', u.id); toast(`Usuario eliminado: ${u.name}`); }
  });

  $('#usersRows').addEventListener('change', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    const u = db.get('users', t.dataset.toggle);
    if (!ctx.guard('edit')) { t.checked = !t.checked; return; }
    if (!t.checked && u.id === ctx.user.id) { toast('No puedes desactivar tu propia cuenta.', 'error'); t.checked = true; return; }
    if (!t.checked && isLastAdmin(u)) { toast('Debe existir al menos un administrador activo.', 'error'); t.checked = true; return; }
    db.update('users', u.id, { status: t.checked ? 'Activo' : 'Inactivo' });
    toast(`${u.name} ${t.checked ? 'activado' : 'desactivado'}.`, 'info');
  });
  $('#newUser').addEventListener('click', () => openForm(null));

  /* ---------- Formulario ---------- */
  function validateEmail() {
    const email = F.email.value.trim().toLowerCase();
    const dup = email && db.all('users').find((u) => u.email.toLowerCase() === email && u.id !== state.editingId);
    F.email.setCustomValidity(dup ? 'Ese correo ya está registrado' : '');
    $('#emailHint').textContent = dup ? `Ya pertenece a ${dup.name}.` : '';
  }
  F.email.addEventListener('input', validateEmail);

  function openForm(id) {
    if (!ctx.guard(id ? 'edit' : 'create')) return;
    state.editingId = id;
    form.reset();
    const u = id ? db.get('users', id) : null;
    const staff = u ? u.type === 'Personal' : isStaff();
    state.formType = staff ? 'Personal' : 'Cliente';
    $('#udTitle').textContent = u ? `Editar ${staff ? 'usuario' : 'cliente'}` : `Nuevo ${staff ? 'usuario' : 'cliente'}`;
    $('#udSub').textContent = staff ? 'Define el acceso y el rol dentro del panel.' : 'Datos de contacto del cliente.';
    $('#udSave').textContent = u ? 'Guardar cambios' : (staff ? 'Crear usuario' : 'Crear cliente');
    $('#roleField').hidden = !staff;
    F.role.required = staff;
    F.role.innerHTML = db.all('roles').map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    F.name.value = u?.name || '';
    F.email.value = u?.email || '';
    F.phone.value = u?.phone || '';
    F.status.value = u?.status || 'Activo';
    F.role.value = u?.roleId || 'role_caja';

    // Protecciones para no quedarse sin acceso
    const me = u && u.id === ctx.user.id;
    const last = u && isLastAdmin(u);
    F.role.disabled = !!(me || last);
    F.status.disabled = !!(me || last);
    $('#roleHint').textContent = me ? 'No puedes cambiar tu propio rol.' : last ? 'Es el único administrador activo.' : '';
    validateEmail();
    openModal(dlg);
    F.name.focus();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const editing = state.editingId;
    if (!ctx.guard(editing ? 'edit' : 'create')) return;
    validateEmail();
    if (!form.reportValidity()) return;
    const staff = state.formType === 'Personal';
    const prev = editing ? db.get('users', editing) : null;
    const data = {
      name: F.name.value.trim().replace(/\s+/g, ' '), email: F.email.value.trim().toLowerCase(), phone: F.phone.value.trim(),
      status: F.status.disabled && prev ? prev.status : F.status.value,
      roleId: staff ? (F.role.disabled && prev ? prev.roleId : F.role.value) : null,
    };
    if (editing) { db.update('users', editing, data); toast(`Usuario actualizado: ${data.name}`); }
    else {
      db.insert('users', { id: db.nextId('users', 'U', 2), type: state.formType, ...data, createdAt: new Date().toISOString(), lastAccess: new Date().toISOString() });
      toast(`${staff ? 'Usuario' : 'Cliente'} creado: ${data.name}`);
    }
    closeModal(dlg);
  });

  render();
  onDataChange(render);
}

})();
