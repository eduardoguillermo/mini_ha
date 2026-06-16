'use strict';

// ── CONSTANTES ────────────────────────────────────────────────────────────────
const SKEY = 'mini-ha';
const VERSION = 'v1.01';

const ESTADOS_PROY = ['Planificado','En curso','Pausado','Finalizado','Cancelado'];
const ESTADO_PILL = {
  'Planificado':'p-planif',
  'En curso':   'p-curso',
  'Pausado':    'p-pausado',
  'Finalizado': 'p-fin',
  'Cancelado':  'p-cancel'
};

// ── DB ────────────────────────────────────────────────────────────────────────
let DB = {
  nid: 1,
  proyectosHA: [],
  catalogoVSS: [],   // componentes importados desde VSS Logística
  config: {
    categorias: ['Automatización','Hardware','Mantenimiento','Integración','Bug fix','Dashboard','Red','Otro'],
    empresa: 'Casa HA'
  }
};

function load(){
  try{
    const raw = localStorage.getItem(SKEY);
    if(raw) DB = JSON.parse(raw);
    if(!DB.nid)         DB.nid = 1;
    if(!DB.proyectosHA) DB.proyectosHA = [];
    if(!DB.catalogoVSS) DB.catalogoVSS = [];
    if(!DB.config)      DB.config = {};
    if(!DB.config.categorias)  DB.config.categorias = ['Automatización','Hardware','Mantenimiento','Integración','Bug fix','Dashboard','Red','Otro'];
    if(!DB.config.empresa)     DB.config.empresa = 'Casa HA';
    if(!DB.config.materialesManual) DB.config.materialesManual = [];
    if(!DB.config.rubros)          DB.config.rubros = [];
    if(!DB.config.plantillas)  DB.config.plantillas = [
      'Editar configuration.yaml',
      'Reiniciar Home Assistant',
      'Probar automatización',
      'Verificar logs',
      'Hacer backup de HA',
      'Actualizar integración',
      'Documentar cambio'
    ];
  } catch(e){ console.error('Error load:', e); }
}

function save(){
  try{ localStorage.setItem(SKEY, JSON.stringify(DB)); }
  catch(e){ alert('Error al guardar: '+e.message); }
}

// ── UTILIDADES ────────────────────────────────────────────────────────────────
function today(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function fmtFecha(f){
  if(!f) return '--';
  const [y,m,d] = f.split('-');
  return d+'/'+m+'/'+y;
}

function nextId(){ return DB.nid++; }

function nextNumeroProy(){
  const nums = DB.proyectosHA.map(p => parseInt((p.numero||'HA-000').split('-')[1])||0);
  const max = nums.length ? Math.max(...nums) : 0;
  return 'HA-'+String(max+1).padStart(3,'0');
}

function pill(estado){
  const cls = ESTADO_PILL[estado] || 'p-cancel';
  return `<span class="pill ${cls}">${estado}</span>`;
}

function pctOperaciones(proy){
  if(!proy.operaciones || !proy.operaciones.length) return 0;
  const hechas = proy.operaciones.filter(o => o.hecha).length;
  return Math.round(hechas / proy.operaciones.length * 100);
}

function agregarHistorial(proy, accion){
  if(!proy.historial) proy.historial = [];
  proy.historial.unshift({ fecha: today(), accion });
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── NAVEGACIÓN ────────────────────────────────────────────────────────────────
const PANELS = ['dashboard','proyectos','proy-ficha','reportes','config','backup'];
let _panel = 'dashboard';
let _proyActual = null; // id del subproyecto abierto

function goTo(panel, extra){
  _panel = panel;
  PANELS.forEach(p => {
    const el = document.getElementById('nav-'+p);
    if(el) el.classList.remove('on');
  });
  const navKey = panel === 'proy-ficha' ? 'proyectos' : panel;
  const navEl = document.getElementById('nav-'+navKey);
  if(navEl) navEl.classList.add('on');

  const titles = {
    'dashboard':  'Dashboard',
    'proyectos':  'Subproyectos',
    'proy-ficha': 'Subproyecto',
    'reportes':   'Reportes',
    'config':     'Configuración',
    'backup':     'Backup / Restaurar'
  };
  document.getElementById('ptitle').textContent = titles[panel] || panel;

  const renders = {
    'dashboard':  renderDashboard,
    'proyectos':  renderProyectos,
    'proy-ficha': () => renderFicha(_proyActual),
    'reportes':   renderReportes,
    'config':     renderConfig,
    'backup':     renderBackup
  };
  document.getElementById('pacts').innerHTML = '';
  if(renders[panel]) renders[panel](extra);
}

function abrirProyecto(id){
  _proyActual = id;
  const p = DB.proyectosHA.find(x => x.id === id);
  if(p) document.getElementById('ptitle').textContent = p.numero + ' — ' + p.titulo;
  goTo('proy-ficha');
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function renderDashboard(){
  const activos  = DB.proyectosHA.filter(p => p.estado === 'En curso');
  const planif   = DB.proyectosHA.filter(p => p.estado === 'Planificado');
  const pausados = DB.proyectosHA.filter(p => p.estado === 'Pausado');
  const finalizados = DB.proyectosHA.filter(p => p.estado === 'Finalizado');
  const total    = DB.proyectosHA.length;

  const costoTotal     = DB.proyectosHA.reduce((a, p) => a + costoSubproy(p), 0);
  const costoActivos   = activos.reduce((a, p) => a + costoSubproy(p), 0);
  const costoFin       = finalizados.reduce((a, p) => a + costoSubproy(p), 0);

  let html = `
  <div class="stats">
    <div class="stat"><div class="stat-n blue">${total}</div><div class="stat-l">Total</div></div>
    <div class="stat"><div class="stat-n" style="color:var(--primary-light)">${activos.length}</div><div class="stat-l">En curso</div></div>
    <div class="stat"><div class="stat-n amber">${planif.length}</div><div class="stat-l">Planificados</div></div>
    <div class="stat"><div class="stat-n amber">${pausados.length}</div><div class="stat-l">Pausados</div></div>
    <div class="stat"><div class="stat-n green">${finalizados.length}</div><div class="stat-l">Finalizados</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-n" style="color:var(--primary-light)">${fmtPesos(costoTotal)}</div><div class="stat-l">Costo total</div></div>
    <div class="stat"><div class="stat-n amber">${fmtPesos(costoActivos)}</div><div class="stat-l">En curso</div></div>
    <div class="stat"><div class="stat-n green">${fmtPesos(costoFin)}</div><div class="stat-l">Finalizados</div></div>
  </div>`;

  if(activos.length){
    html += `<div class="card">
      <div class="ch"><span class="ct">En curso</span></div>
      <div class="card-body"><div class="proy-grid">`;
    activos.forEach(p => { html += cardProy(p); });
    html += `</div></div></div>`;
  }

  if(planif.length){
    html += `<div class="card">
      <div class="ch"><span class="ct">Planificados</span></div>
      <div class="card-body"><div class="proy-grid">`;
    planif.forEach(p => { html += cardProy(p); });
    html += `</div></div></div>`;
  }

  if(pausados.length){
    html += `<div class="card">
      <div class="ch"><span class="ct">Pausados</span></div>
      <div class="card-body"><div class="proy-grid">`;
    pausados.forEach(p => { html += cardProy(p); });
    html += `</div></div></div>`;
  }

  if(!total){
    html += `<div class="empty">No hay subproyectos todavía.<br><br>
      <button class="btn btn-p" onclick="modalNuevoProy()">+ Nuevo subproyecto</button></div>`;
  }

  document.getElementById('content').innerHTML = html;
  document.getElementById('pacts').innerHTML =
    `<button class="btn btn-p" onclick="modalNuevoProy()">+ Nuevo</button>`;
}

function cardProy(p){
  const pct = pctOperaciones(p);
  return `<div class="proy-card" onclick="abrirProyecto(${p.id})">
    <div class="proy-card-num">${esc(p.numero)}</div>
    <div class="proy-card-title">${esc(p.titulo)}</div>
    <div class="proy-card-obj">${esc(p.objetivo||'')}</div>
    <div class="proy-progress"><div class="proy-progress-bar" style="width:${pct}%"></div></div>
    <div class="proy-card-footer">
      ${pill(p.estado)}
      <span class="proy-card-cat text3">${esc(p.categoria||'')}</span>
      <span class="text3" style="font-size:10px">${pct}%</span>
    </div>
  </div>`;
}

// ── LISTA DE SUBPROYECTOS ─────────────────────────────────────────────────────
function renderProyectos(){
  document.getElementById('pacts').innerHTML =
    `<button class="btn btn-p" onclick="modalNuevoProy()">+ Nuevo</button>`;

  let html = `<div class="sbar">
    <input id="sp-busq" placeholder="Buscar..." oninput="filtrarProyectos()" style="width:200px">
    <select id="sp-estado" onchange="filtrarProyectos()">
      <option value="">Todos los estados</option>
      ${ESTADOS_PROY.map(e=>`<option value="${e}">${e}</option>`).join('')}
    </select>
    <select id="sp-cat" onchange="filtrarProyectos()">
      <option value="">Todas las categorías</option>
      ${DB.config.categorias.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
    </select>
  </div>
  <div id="sp-lista"></div>`;

  document.getElementById('content').innerHTML = html;
  filtrarProyectos();
}

function filtrarProyectos(){
  const busq   = (document.getElementById('sp-busq')||{value:''}).value.toLowerCase();
  const estado = (document.getElementById('sp-estado')||{value:''}).value;
  const cat    = (document.getElementById('sp-cat')||{value:''}).value;

  let lista = DB.proyectosHA.filter(p => {
    if(estado && p.estado !== estado) return false;
    if(cat && p.categoria !== cat) return false;
    if(busq && !(p.titulo+p.objetivo+p.numero).toLowerCase().includes(busq)) return false;
    return true;
  });

  const cont = document.getElementById('sp-lista');
  if(!cont) return;

  if(!lista.length){
    cont.innerHTML = `<div class="empty">No hay subproyectos${DB.proyectosHA.length?'' : '.<br><br><button class="btn btn-p" onclick="modalNuevoProy()">+ Nuevo subproyecto</button>'}.</div>`;
    return;
  }

  cont.innerHTML = `<div class="twrap"><table>
    <thead><tr>
      <th>#</th><th>Título</th><th>Categoría</th><th>Rubro</th><th>Estado</th>
      <th>Inicio</th><th>Est. fin</th><th>Avance</th><th></th>
    </tr></thead>
    <tbody>${lista.map(p => {
      const pct = pctOperaciones(p);
      return `<tr onclick="abrirProyecto(${p.id})" style="cursor:pointer">
        <td class="mono text3" style="font-size:10px">${esc(p.numero)}</td>
        <td style="font-weight:600">${esc(p.titulo)}</td>
        <td class="text2" style="font-size:11px">${esc(p.categoria||'--')}</td>
        <td class="text2" style="font-size:11px">${esc(p.rubro||'--')}</td>
        <td>${pill(p.estado)}</td>
        <td class="text2" style="font-size:11px">${fmtFecha(p.fechaInicio)}</td>
        <td class="text2" style="font-size:11px">${fmtFecha(p.fechaEstFin)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:4px;background:var(--border);border-radius:2px;min-width:50px">
              <div style="height:4px;background:var(--primary);border-radius:2px;width:${pct}%"></div>
            </div>
            <span style="font-size:10px;color:var(--text3);width:28px;text-align:right">${pct}%</span>
          </div>
        </td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-sm" onclick="modalEditarProy(${p.id})">✏️</button>
          <button class="btn btn-sm btn-d" onclick="confirmarEliminar(${p.id})" style="margin-left:3px">✕</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// ── FICHA SUBPROYECTO ─────────────────────────────────────────────────────────
function renderFicha(id){
  const p = DB.proyectosHA.find(x => x.id === id);
  if(!p){ goTo('proyectos'); return; }

  const pct = pctOperaciones(p);

  let html = `
  <div class="breadcrumb">
    <a onclick="goTo('proyectos')">Subproyectos</a> › ${esc(p.numero)}
  </div>
  <div class="ficha-header">
    <div class="ficha-num">${esc(p.numero)}</div>
    <div class="ficha-title">${esc(p.titulo)}</div>
    <div class="ficha-meta">
      ${pill(p.estado)}
      ${p.categoria ? `<span class="text3" style="font-size:11px">• ${esc(p.categoria)}</span>` : ''}
      ${p.fechaInicio ? `<span class="text3" style="font-size:11px">• Inicio: ${fmtFecha(p.fechaInicio)}</span>` : ''}
      ${p.fechaEstFin ? `<span class="text3" style="font-size:11px">• Est. fin: ${fmtFecha(p.fechaEstFin)}</span>` : ''}
      ${p.fechaFinReal ? `<span class="green" style="font-size:11px">• Finalizado: ${fmtFecha(p.fechaFinReal)}</span>` : ''}
    </div>
    ${p.rubro ? `<div style="font-size:12px;color:var(--primary-light);margin-top:4px;font-weight:600">Rubro: ${esc(p.rubro)}</div>` : ''}
    ${p.objetivo ? `<div class="ficha-obj">${esc(p.objetivo)}</div>` : ''}
    ${p.descripcion ? `<div class="ficha-desc">${esc(p.descripcion)}</div>` : ''}
  </div>

  <div class="card">
    <div class="ch">
      <span class="ct">Operaciones <span class="text3" style="font-size:11px;font-weight:400">${pct}% completado</span></span>
      <button class="btn btn-sm btn-p" onclick="modalNuevaOp(${p.id})">+ Agregar</button>
    </div>
    <div class="card-body" id="ficha-ops">
      ${renderOps(p)}
    </div>
  </div>`;

  // Materiales
  const tieneMats = p.materiales && p.materiales.length;
  const tieneMatsCat = tieneMats && p.materiales.some(m => m.compId);
  html += `<div class="card">
    <div class="ch">
      <span class="ct">Materiales usados</span>
      <div style="display:flex;gap:6px">
        ${tieneMatsCat ? `<button class="btn btn-sm btn-g" onclick="exportarSalidasVSS(${p.id})">⬇️ Exportar salidas VSS</button>` : ''}
        <button class="btn btn-sm btn-p" onclick="modalNuevoMaterial(${p.id})">+ Agregar</button>
      </div>
    </div>
    <div class="card-body" id="ficha-mats">
      ${renderMateriales(p)}
    </div>
  </div>`;
  if(p.dispositivos && p.dispositivos.trim()){
    html += `<div class="card">
      <div class="ch"><span class="ct">Dispositivos involucrados</span></div>
      <div class="card-body" style="font-size:12px;color:var(--text2);white-space:pre-wrap">${esc(p.dispositivos)}</div>
    </div>`;
  }

  // Automatizaciones
  const autos = [p.auto1, p.auto2].filter(a => a && a.nombre);
  if(autos.length){
    html += `<div class="card">
      <div class="ch"><span class="ct">Automatizaciones</span></div>
      <div class="card-body">
        ${autos.map(a => `<div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:var(--primary-light);font-family:monospace;margin-bottom:4px">${esc(a.nombre)}</div>
          <div style="font-size:12px;color:var(--text2);white-space:pre-wrap;line-height:1.6">${esc(a.desc)}</div>
        </div>`).join('<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">')}
      </div>
    </div>`;
  }

  // Links
  if(p.links && p.links.length){
    html += `<div class="card">
      <div class="ch"><span class="ct">Links</span></div>
      <div class="card-body">
        ${p.links.map((l,i) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <a href="${esc(l.url)}" target="_blank" style="color:var(--primary-light);font-size:12px;flex:1">${esc(l.label||l.url)}</a>
          <button class="btn btn-sm btn-d" onclick="eliminarLink(${p.id},${i})">✕</button>
        </div>`).join('')}
        <button class="btn btn-sm" onclick="modalNuevoLink(${p.id})" style="margin-top:4px">+ Link</button>
      </div>
    </div>`;
  } else {
    html += `<div style="margin-bottom:12px">
      <button class="btn btn-sm" onclick="modalNuevoLink(${p.id})">+ Link</button>
    </div>`;
  }

  // Historial
  if(p.historial && p.historial.length){
    html += `<div class="card">
      <div class="ch"><span class="ct">Historial</span></div>
      <div class="card-body">
        ${p.historial.slice(0,20).map(h =>
          `<div class="hist-item">
            <span class="hist-fecha">${fmtFecha(h.fecha)}</span>
            <span class="hist-accion">${esc(h.accion)}</span>
          </div>`
        ).join('')}
        ${p.historial.length > 20 ? `<div class="text3" style="font-size:10px;margin-top:6px">... y ${p.historial.length-20} entradas más</div>` : ''}
      </div>
    </div>`;
  }

  document.getElementById('content').innerHTML = html;
  document.getElementById('pacts').innerHTML = `
    <button class="btn btn-sm" onclick="modalEditarProy(${p.id})">✏️ Editar</button>
    <button class="btn btn-sm" onclick="modalCambiarEstado(${p.id})">${p.estado === 'Finalizado' ? '↩️ Reabrir' : '⚡ Estado'}</button>
  `;
}

function renderOps(p){
  if(!p.operaciones || !p.operaciones.length){
    return `<div class="empty" style="padding:16px">Sin operaciones. Agregá la primera.</div>`;
  }
  return p.operaciones.map((op,i) => {
    const bloqueada = i > 0 && !p.operaciones[i-1].hecha;
    const itemCls   = op.hecha ? 'hecha' : (bloqueada ? 'bloqueada' : '');
    const descCls   = op.hecha ? 'hecha' : '';
    const lockTip   = bloqueada ? ` title="Completá la operación ${i} primero"` : '';
    return `<div class="op-item ${itemCls}" id="op-${p.id}-${i}">
      <span class="op-num">${i+1}</span>
      <input type="checkbox" ${op.hecha?'checked':''} ${bloqueada?'disabled':''} onchange="toggleOp(${p.id},${i})"${lockTip}>
      <span class="op-desc ${descCls}">${esc(op.desc)}${bloqueada?' <span class="op-lock">&#128274;</span>':''}</span>
      <div class="op-actions">
        <button class="btn btn-sm" onclick="moverOp(${p.id},${i},-1)" ${i===0?'disabled':''}>↑</button>
        <button class="btn btn-sm" onclick="moverOp(${p.id},${i},1)" ${i===p.operaciones.length-1?'disabled':''}>↓</button>
        <button class="btn btn-sm btn-d" onclick="eliminarOp(${p.id},${i})">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── OPERACIONES ───────────────────────────────────────────────────────────────
function toggleOp(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p || !p.operaciones[idx]) return;
  p.operaciones[idx].hecha = !p.operaciones[idx].hecha;
  save();
  const cont = document.getElementById('ficha-ops');
  if(cont) cont.innerHTML = renderOps(p);
  // Actualizar progreso en topbar
  const pct = pctOperaciones(p);
  const ptitleEl = document.getElementById('ptitle');
  if(ptitleEl) ptitleEl.textContent = p.numero + ' — ' + p.titulo;
}

function moverOp(proyId, idx, dir){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  const ops = p.operaciones;
  const newIdx = idx + dir;
  if(newIdx < 0 || newIdx >= ops.length) return;
  [ops[idx], ops[newIdx]] = [ops[newIdx], ops[idx]];
  save();
  const cont = document.getElementById('ficha-ops');
  if(cont) cont.innerHTML = renderOps(p);
}

function eliminarOp(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  if(!confirm('¿Eliminar esta operación?')) return;
  p.operaciones.splice(idx, 1);
  save();
  const cont = document.getElementById('ficha-ops');
  if(cont) cont.innerHTML = renderOps(p);
}

function modalNuevaOp(proyId){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  const plantillas = DB.config.plantillas || [];
  const existentes = (p.operaciones||[]).map(o => o.desc);
  const listaPl = plantillas.length
    ? `<div class="fg">
        <label>Plantillas</label>
        <div id="op-plantillas" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r);padding:6px 8px;background:var(--surface2)">
          ${plantillas.map((pl,i) => `
            <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;cursor:pointer;font-size:12px;color:var(--text2);border-bottom:1px solid var(--border)">
              <input type="checkbox" value="${esc(pl)}" style="accent-color:var(--primary);width:14px;height:14px">
              ${esc(pl)}
            </label>`).join('')}
        </div>
      </div>`
    : '<div class="text3" style="font-size:11px;margin-bottom:10px">No hay plantillas definidas. Podés agregar desde Configuración.</div>';

  abrirModal('Agregar operaciones',
    `${listaPl}
     <div class="fg">
       <label>Operación personalizada (opcional)</label>
       <textarea id="op-desc" rows="2" placeholder="Escribí una operación libre..."></textarea>
     </div>`,
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarNuevaOp(${proyId})">Agregar</button>`
  );
}

function guardarNuevaOp(proyId){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  if(!p.operaciones) p.operaciones = [];

  // Plantillas seleccionadas
  const checks = document.querySelectorAll('#op-plantillas input[type=checkbox]:checked');
  checks.forEach(ch => {
    const desc = ch.value.trim();
    if(desc) p.operaciones.push({ desc, hecha: false });
  });

  // Operación libre
  const libre = (document.getElementById('op-desc').value||'').trim();
  if(libre) p.operaciones.push({ desc: libre, hecha: false });

  if(!checks.length && !libre){ alert('Seleccioná al menos una operación o escribí una.'); return; }

  save();
  cerrarModal();
  const cont = document.getElementById('ficha-ops');
  if(cont) cont.innerHTML = renderOps(p);
}

// ── LINKS ─────────────────────────────────────────────────────────────────────
function modalNuevoLink(proyId){
  abrirModal('Agregar link',
    `<div class="fg"><label>URL</label><input id="lk-url" type="url" placeholder="https://..."></div>
     <div class="fg"><label>Etiqueta (opcional)</label><input id="lk-label" placeholder="Nombre descriptivo"></div>`,
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarLink(${proyId})">Agregar</button>`
  );
}

function guardarLink(proyId){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  const url = (document.getElementById('lk-url').value||'').trim();
  if(!url){ alert('Ingresá una URL.'); return; }
  const label = (document.getElementById('lk-label').value||'').trim();
  if(!p.links) p.links = [];
  p.links.push({ url, label });
  save();
  cerrarModal();
  renderFicha(proyId);
}

function eliminarLink(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p || !p.links) return;
  if(!confirm('¿Eliminar este link?')) return;
  p.links.splice(idx, 1);
  save();
  renderFicha(proyId);
}

// ── ABM SUBPROYECTOS ──────────────────────────────────────────────────────────
function formProy(p){
  const cats = DB.config.categorias.map(c =>
    `<option value="${esc(c)}" ${p&&p.categoria===c?'selected':''}>${esc(c)}</option>`
  ).join('');
  const rubs = (DB.config.rubros||[]).map(r =>
    `<option value="${esc(r)}" ${p&&p.rubro===r?'selected':''}>${esc(r)}</option>`
  ).join('');
  return `<div class="fgrid">
    <div class="fg"><label>Título *</label><input id="pf-titulo" value="${esc(p?p.titulo:'')}" placeholder="Nombre del subproyecto"></div>
    <div class="fg"><label>Categoría</label><select id="pf-cat"><option value="">-- sin categoría --</option>${cats}</select></div>
    <div class="fg"><label>Rubro HA</label><select id="pf-rubro"><option value="">-- sin rubro --</option>${rubs}</select></div>
    <div class="fg full"><label>Objetivo</label><input id="pf-objetivo" value="${esc(p?p.objetivo:'')}" placeholder="Qué se quiere lograr"></div>
    <div class="fg full"><label>Descripción / Contexto</label><textarea id="pf-desc" rows="3" placeholder="Detalles, contexto técnico, notas...">${esc(p?p.descripcion:'')}</textarea></div>
    <div class="fg"><label>Fecha inicio</label><input id="pf-finicio" type="date" value="${p?p.fechaInicio||'':''}"></div>
    <div class="fg"><label>Fecha est. fin</label><input id="pf-festfin" type="date" value="${p?p.fechaEstFin||'':''}"></div>
    <div class="fg full"><label>Dispositivos involucrados</label><textarea id="pf-dispositivos" rows="2" placeholder="ej: sensor.temperatura_living, switch.luz_cocina...">${esc(p?p.dispositivos:'')}</textarea></div>
    <div class="fg full" style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px"><label style="color:var(--text2)">Automatización 1</label></div>
    <div class="fg"><label>Nombre</label><input id="pf-auto1n" value="${esc(p&&p.auto1?p.auto1.nombre:'')}" placeholder="alias de la automatización"></div>
    <div class="fg full"><label>Descripción</label><textarea id="pf-auto1d" rows="3" placeholder="Qué hace...">${esc(p&&p.auto1?p.auto1.desc:'')}</textarea></div>
    <div class="fg full" style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px"><label style="color:var(--text2)">Automatización 2 (opcional)</label></div>
    <div class="fg"><label>Nombre</label><input id="pf-auto2n" value="${esc(p&&p.auto2?p.auto2.nombre:'')}" placeholder="alias de la automatización"></div>
    <div class="fg full"><label>Descripción</label><textarea id="pf-auto2d" rows="3" placeholder="Qué hace...">${esc(p&&p.auto2?p.auto2.desc:'')}</textarea></div>
  </div>`;
}

function modalNuevoProy(){
  abrirModal('Nuevo subproyecto', formProy(null),
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarNuevoProy()">Crear</button>`
  );
  setTimeout(()=>{ const el=document.getElementById('pf-titulo'); if(el) el.focus(); },80);
}

function guardarNuevoProy(){
  const titulo = (document.getElementById('pf-titulo').value||'').trim();
  if(!titulo){ alert('El título es obligatorio.'); return; }
  const p = {
    id:          nextId(),
    numero:      nextNumeroProy(),
    titulo,
    objetivo:    document.getElementById('pf-objetivo').value.trim(),
    descripcion: document.getElementById('pf-desc').value.trim(),
    categoria:   document.getElementById('pf-cat').value,
    rubro:       document.getElementById('pf-rubro').value,
    estado:      'Planificado',
    fechaInicio: document.getElementById('pf-finicio').value,
    fechaEstFin: document.getElementById('pf-festfin').value,
    fechaFinReal:'',
    dispositivos:document.getElementById('pf-dispositivos').value.trim(),
    auto1: { nombre:'', desc:'' },
    auto2: { nombre:'', desc:'' },
    operaciones: [],
    links:       [],
    historial:   []
  };
  agregarHistorial(p, 'Subproyecto creado');
  DB.proyectosHA.push(p);
  save();
  cerrarModal();
  abrirProyecto(p.id);
}

function modalEditarProy(id){
  const p = DB.proyectosHA.find(x => x.id === id);
  if(!p) return;
  abrirModal('Editar subproyecto', formProy(p),
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarEditarProy(${id})">Guardar</button>`
  );
}

function guardarEditarProy(id){
  const p = DB.proyectosHA.find(x => x.id === id);
  if(!p) return;
  const titulo = (document.getElementById('pf-titulo').value||'').trim();
  if(!titulo){ alert('El título es obligatorio.'); return; }
  p.titulo       = titulo;
  p.objetivo     = document.getElementById('pf-objetivo').value.trim();
  p.descripcion  = document.getElementById('pf-desc').value.trim();
  p.categoria    = document.getElementById('pf-cat').value;
  p.rubro        = document.getElementById('pf-rubro').value;
  p.fechaInicio  = document.getElementById('pf-finicio').value;
  p.fechaEstFin  = document.getElementById('pf-festfin').value;
  p.dispositivos = document.getElementById('pf-dispositivos').value.trim();
  p.auto1 = { nombre: (document.getElementById('pf-auto1n').value||'').trim(), desc: (document.getElementById('pf-auto1d').value||'').trim() };
  p.auto2 = { nombre: (document.getElementById('pf-auto2n').value||'').trim(), desc: (document.getElementById('pf-auto2d').value||'').trim() };
  agregarHistorial(p, 'Datos editados');
  save();
  cerrarModal();
  if(_panel === 'proy-ficha') renderFicha(id);
  else renderProyectos();
}

function modalCambiarEstado(id){
  const p = DB.proyectosHA.find(x => x.id === id);
  if(!p) return;
  const opts = ESTADOS_PROY.map(e =>
    `<option value="${e}" ${p.estado===e?'selected':''}>${e}</option>`
  ).join('');
  abrirModal('Cambiar estado',
    `<div class="fg"><label>Estado</label><select id="ce-estado">${opts}</select></div>
     <div class="fg"><label>Nota (opcional)</label><input id="ce-nota" placeholder="Motivo del cambio..."></div>`,
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarEstado(${id})">Guardar</button>`
  );
}

function guardarEstado(id){
  const p = DB.proyectosHA.find(x => x.id === id);
  if(!p) return;
  const nuevo = document.getElementById('ce-estado').value;
  const nota  = (document.getElementById('ce-nota').value||'').trim();
  const anterior = p.estado;
  p.estado = nuevo;
  if(nuevo === 'Finalizado' && !p.fechaFinReal) p.fechaFinReal = today();
  if(nuevo !== 'Finalizado') p.fechaFinReal = '';
  const msg = `Estado: ${anterior} → ${nuevo}` + (nota ? ` (${nota})` : '');
  agregarHistorial(p, msg);
  save();
  cerrarModal();
  if(_panel === 'proy-ficha') renderFicha(id);
  else renderProyectos();
}

function confirmarEliminar(id){
  const p = DB.proyectosHA.find(x => x.id === id);
  if(!p) return;
  if(!confirm(`¿Eliminar "${p.titulo}"? Esta acción no se puede deshacer.`)) return;
  DB.proyectosHA = DB.proyectosHA.filter(x => x.id !== id);
  save();
  if(_panel === 'proy-ficha') goTo('proyectos');
  else renderProyectos();
}

// ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
function renderConfig(){
  document.getElementById('pacts').innerHTML = '';
  const cats = (DB.config.categorias||[]).join('\n');
  const pls  = (DB.config.plantillas||[]).join('\n');
  const mans = (DB.config.materialesManual||[]).join('\n');
  const rubs = (DB.config.rubros||[]).join('\n');
  const html = `<div class="card">
    <div class="ch"><span class="ct">Categorías de subproyecto</span></div>
    <div class="card-body">
      <div class="fg"><label>Una categoría por línea</label>
        <textarea id="cfg-cats" rows="6" style="font-family:monospace">${esc(cats)}</textarea>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Plantillas de operaciones</span></div>
    <div class="card-body">
      <p class="text2" style="font-size:11px;margin-bottom:8px">Operaciones reutilizables. Una por línea.</p>
      <div class="fg">
        <textarea id="cfg-pls" rows="8" style="font-family:monospace">${esc(pls)}</textarea>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Rubros HA</span></div>
    <div class="card-body">
      <p class="text2" style="font-size:11px;margin-bottom:8px">Clasificación de automatizaciones. Una por línea.</p>
      <div class="fg"><textarea id="cfg-rubs" rows="6" style="font-family:monospace">${esc(rubs)}</textarea></div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Lista de materiales manuales</span></div>
    <div class="card-body">
      <p class="text2" style="font-size:11px;margin-bottom:8px">Nombres reutilizables para materiales manuales. Una por línea.</p>
      <div class="fg">
        <textarea id="cfg-mans" rows="8" style="font-family:monospace">${esc(mans)}</textarea>
      </div>
    </div>
  </div>
  <button class="btn btn-p" onclick="guardarConfig()">Guardar todo</button>`;
  document.getElementById('content').innerHTML = html;
}

function guardarConfig(){
  const cats = (document.getElementById('cfg-cats').value||'')
    .split('\n').map(s=>s.trim()).filter(Boolean);
  const pls  = (document.getElementById('cfg-pls').value||'')
    .split('\n').map(s=>s.trim()).filter(Boolean);
  if(!cats.length){ alert('Necesitás al menos una categoría.'); return; }
  const mans = (document.getElementById('cfg-mans').value||'')
    .split('\n').map(s=>s.trim()).filter(Boolean);
  const rubs2 = (document.getElementById('cfg-rubs').value||'')
    .split('\n').map(s=>s.trim()).filter(Boolean);
  DB.config.rubros           = rubs2;
  DB.config.categorias       = cats;
  DB.config.plantillas      = pls;
  DB.config.materialesManual = mans;
  save();
  alert('Configuración guardada.');
}

// ── BACKUP ────────────────────────────────────────────────────────────────────
function exportarBackup(){
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mini-ha-backup-'+today()+'.json';
  a.click();
}

function importarBackup(ev){
  const file = ev.target.files[0];
  if(!file) return;
  if(!confirm('¿Restaurar este backup? Se perderán todos los datos actuales.')) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = JSON.parse(e.target.result);
      if(!data.proyectosHA) throw new Error('Archivo inválido');
      DB = data;
      save();
      alert('Backup restaurado correctamente.');
      goTo('dashboard');
    } catch(err){
      alert('Error al importar: '+err.message);
    }
  };
  reader.readAsText(file);
}

// ── MATERIALES EN SUBPROYECTO ─────────────────────────────────────────────────
function costoMaterial(m){
  if(m.costoManual != null) return m.costoManual * m.cant;
  const comp = DB.catalogoVSS.find(c => c.id === m.compId);
  return comp ? (comp.costo||0) * m.cant : 0;
}

function costoSubproy(p){
  return (p.materiales||[]).reduce((acc, m) => acc + costoMaterial(m), 0);
}

function fmtPesos(n){
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function renderMateriales(p){
  if(!p.materiales || !p.materiales.length){
    return `<div class="empty" style="padding:16px">Sin materiales registrados.</div>`;
  }
  const total = costoSubproy(p);
  return `<table>
    <thead><tr>
      <th>Componente</th><th>Cant.</th><th>Costo unit.</th><th>Subtotal</th><th>Notas</th><th></th>
    </tr></thead>
    <tbody>${p.materiales.map((m,i) => {
      const comp      = DB.catalogoVSS.find(c => c.id === m.compId);
      const nombre    = comp ? `${comp.codigo ? comp.codigo+' — ' : ''}${comp.nombre}` : (m.nombreLibre||'(sin catálogo)');
      const costoUnit = m.costoManual != null ? m.costoManual : (comp ? comp.costo||0 : null);
      const subtotal  = costoMaterial(m);
      const esManual  = m.costoManual != null;
      return `<tr>
        <td style="font-size:12px">${esc(nombre)}${esManual?'<span class="text3" style="font-size:9px;margin-left:4px">manual</span>':''}</td>
        <td style="font-size:12px">${m.cant} ${comp?esc(comp.unidad||''):''}</td>
        <td style="font-size:12px;color:var(--text2)">${costoUnit != null ? fmtPesos(costoUnit) : '<span class="text3">--</span>'}</td>
        <td style="font-size:12px;font-weight:600">${subtotal ? fmtPesos(subtotal) : '<span class="text3">--</span>'}</td>
        <td style="font-size:11px;color:var(--text2)">${esc(m.notas||'')}</td>
        <td>
          <button class="btn btn-sm btn-d" onclick="eliminarMaterial(${p.id},${i})">✕</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
    ${total ? `<tfoot><tr>
      <td colspan="3" style="text-align:right;font-size:11px;color:var(--text2);padding:8px 10px">Total materiales</td>
      <td style="font-weight:700;font-size:13px;color:var(--primary-light);padding:8px 10px">${fmtPesos(total)}</td>
      <td colspan="2"></td>
    </tr></tfoot>` : ''}
  </table>`;
}

function modalNuevoMaterial(proyId){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;

  const tieneCatalogo = DB.catalogoVSS.length > 0;
  const secCatalogo = tieneCatalogo
    ? `<div class="mat-seccion">
        <div class="mat-seccion-title">Del catálogo VSS <span class="text3" style="font-weight:400">(exportable a VSS)</span></div>
        <div class="fgrid">
          <div class="fg full"><label>Componente</label>
            <select id="mat-comp">
              <option value="">-- seleccionar --</option>
              ${[...DB.catalogoVSS].sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'})).map(c =>
                `<option value="${c.id}">${esc((c.codigo?c.codigo+' -- ':'')+c.nombre)}${c.unidad?' ('+c.unidad+')':''}</option>`
              ).join('')}
            </select>
          </div>
          <div class="fg"><label>Cantidad</label><input id="mat-cant" type="number" min="0" step="any" placeholder="0"></div>
          <div class="fg"><label>Notas</label><input id="mat-notas" placeholder="Observaciones..."></div>
        </div>
      </div>`
    : `<div class="alert alert-info" style="margin-bottom:12px">Sin catálogo VSS. Importalo en Backup para usar esta sección.</div>`;

  const listaMan = DB.config.materialesManual || [];
  const optsMan  = listaMan.length
    ? `<option value="">-- escribir nuevo --</option>` + listaMan.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
    : '';

  const secManual = `<div class="mat-seccion">
      <div class="mat-seccion-title">Material manual <span class="text3" style="font-weight:400">(no exportable a VSS)</span></div>
      <div class="fgrid">
        ${listaMan.length ? `<div class="fg full"><label>Desde lista</label>
          <select id="mat-lista-m" onchange="(function(){var v=document.getElementById('mat-lista-m').value;var el=document.getElementById('mat-libre');if(el&&v){el.value=v;}})()">
            ${optsMan}
          </select></div>` : ''}
        <div class="fg full"><label>${listaMan.length ? 'O nombre nuevo' : 'Nombre'}</label>
          <input id="mat-libre" placeholder="Nombre del material...">
        </div>
        <div class="fg"><label>Cantidad</label><input id="mat-cant-m" type="number" min="0" step="any" placeholder="0"></div>
        <div class="fg"><label>Costo unitario $</label><input id="mat-costo-m" type="number" min="0" step="any" placeholder="0"></div>
        <div class="fg full"><label>Notas</label><input id="mat-notas-m" placeholder="Observaciones..."></div>
        <div class="fg full"><label style="flex-direction:row;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="mat-guardar-lista" style="accent-color:var(--primary);width:14px;height:14px">
          Guardar nombre en la lista para uso futuro
        </label></div>
      </div>
    </div>`;

  abrirModal('Agregar materiales',
    `${secCatalogo}<div class="mat-sep"></div>${secManual}`,
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarMaterial(${proyId})">Agregar</button>`
  );
}

function guardarMaterial(proyId){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  if(!p.materiales) p.materiales = [];

  let agregados = 0;

  // Sección catálogo
  const compIdRaw = document.getElementById('mat-comp') ? document.getElementById('mat-comp').value : '';
  const compId    = compIdRaw ? parseInt(compIdRaw) : null;
  const cantCat   = parseFloat(document.getElementById('mat-cant') ? document.getElementById('mat-cant').value : '');
  const notasCat  = document.getElementById('mat-notas') ? (document.getElementById('mat-notas').value||'').trim() : '';
  if(compId){
    if(!cantCat || cantCat <= 0){ alert('Ingresá una cantidad para el componente del catálogo.'); return; }
    p.materiales.push({ compId, cant: cantCat, notas: notasCat });
    agregados++;
  }

  // Sección manual
  const libre    = document.getElementById('mat-libre') ? (document.getElementById('mat-libre').value||'').trim() : '';
  const cantMan  = parseFloat(document.getElementById('mat-cant-m') ? document.getElementById('mat-cant-m').value : '');
  const costoRaw = document.getElementById('mat-costo-m') ? document.getElementById('mat-costo-m').value : '';
  const costoMan = costoRaw !== '' ? parseFloat(costoRaw) : null;
  const notasMan = document.getElementById('mat-notas-m') ? (document.getElementById('mat-notas-m').value||'').trim() : '';
  if(libre){
    if(!cantMan || cantMan <= 0){ alert('Ingresá una cantidad para el material manual.'); return; }
    const mat = { nombreLibre: libre, cant: cantMan, notas: notasMan };
    if(costoMan != null && !isNaN(costoMan)) mat.costoManual = costoMan;
    p.materiales.push(mat);
    agregados++;
    // Guardar en lista si checkbox marcado y nombre nuevo
    const guardarLista = document.getElementById('mat-guardar-lista');
    if(guardarLista && guardarLista.checked){
      if(!DB.config.materialesManual) DB.config.materialesManual = [];
      if(!DB.config.materialesManual.includes(libre)){
        DB.config.materialesManual.push(libre);
        DB.config.materialesManual.sort((a,b) => a.localeCompare(b));
      }
    }
  }

  if(!agregados){ alert('Completá al menos una sección.'); return; }

  save();
  cerrarModal();
  const cont = document.getElementById('ficha-mats');
  if(cont) cont.innerHTML = renderMateriales(p);
}

function eliminarMaterial(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p || !p.materiales) return;
  if(!confirm('¿Eliminar este material?')) return;
  p.materiales.splice(idx, 1);
  save();
  const cont = document.getElementById('ficha-mats');
  if(cont) cont.innerHTML = renderMateriales(p);
}

function exportarSalidasVSS(proyId){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  const mats = (p.materiales||[]).filter(m => m.compId);
  if(!mats.length){
    alert('No hay materiales con componentes del catálogo VSS para exportar.');
    return;
  }
  // Formato compatible con movimientos[] de VSS Logística
  const salidas = mats.map((m, i) => ({
    id:        900000 + i,   // ID temporal — VSS lo reemplaza al importar
    cid:       m.compId,
    tipo:      'Salida',
    cant:      m.cant,
    fecha:     p.fechaFinReal || today(),
    nota:      (m.notas ? m.notas + ' — ' : '') + 'Mini HA: ' + p.numero + ' ' + p.titulo,
    estadoMat: 'N'
  }));
  const blob = new Blob([JSON.stringify({ salidas, proyecto: p.numero, titulo: p.titulo }, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'salidas-vss-'+p.numero+'-'+today()+'.json';
  a.click();
}

// ── CATÁLOGO VSS — IMPORTAR ───────────────────────────────────────────────────
function importarCatalogoVSS(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = JSON.parse(e.target.result);
      // Acepta tanto el backup completo de VSS como solo el array de componentes
      const comps = data.componentes || (Array.isArray(data) ? data : null);
      if(!comps || !comps.length) throw new Error('No se encontraron componentes en el archivo.');
      DB.catalogoVSS = comps.map(c => ({
        id:     c.id,
        codigo: c.codigo||'',
        nombre: c.desc||c.nombre||'',   // VSS usa 'desc' como nombre
        unidad: c.unidad||'',
        costo:  c.costo||0
      }));
      save();
      alert(`Catálogo importado: ${DB.catalogoVSS.length} componentes.`);
      renderBackup();
    } catch(err){
      alert('Error al importar catálogo: '+err.message);
    }
  };
  reader.readAsText(file);
}

// ── REPORTES ──────────────────────────────────────────────────────────────────
function renderReportes(){
  const pacts = document.getElementById('pacts');
  pacts.innerHTML = `<button class="btn btn-sm" onclick="exportarReporteXLSX()">⬇ Exportar Excel</button>`;

  const ps = DB.proyectosHA || [];

  const estados = ['Planificado','En curso','Pausado','Finalizado','Cancelado'];
  const porEstado = {};
  estados.forEach(e => porEstado[e] = 0);
  ps.forEach(p => { if(porEstado[p.estado] !== undefined) porEstado[p.estado]++; });

  const costoTotal = ps.reduce((s,p) => s + costoSubproy(p), 0);
  const costoEnCurso = ps.filter(p=>p.estado==='En curso').reduce((s,p)=>s+costoSubproy(p),0);
  const costoFin = ps.filter(p=>p.estado==='Finalizado').reduce((s,p)=>s+costoSubproy(p),0);

  const top5 = [...ps].sort((a,b)=>costoSubproy(b)-costoSubproy(a)).slice(0,5);

  const porCat = {};
  ps.forEach(p => {
    const c = p.categoria || 'Sin categoria';
    if(!porCat[c]) porCat[c] = {cant:0, costo:0};
    porCat[c].cant++;
    porCat[c].costo += costoSubproy(p);
  });
  const catsSorted = Object.entries(porCat).sort((a,b)=>b[1].cant-a[1].cant);

  const COLOR_ESTADO = {
    'Planificado':'#5a8fc4',
    'En curso':   '#00838f',
    'Pausado':    '#c4955a',
    'Finalizado': '#4caf7d',
    'Cancelado':  '#888'
  };

  const maxEstado = Math.max(...Object.values(porEstado), 1);
  const barW = 48; const barGap = 18; const chartH = 120;
  const totalW = estados.length * (barW + barGap);
  const barsSVG = estados.map((e,i) => {
    const val = porEstado[e];
    const h = val === 0 ? 2 : Math.max(4, Math.round((val / maxEstado) * chartH));
    const x = i * (barW + barGap);
    const y = chartH - h;
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${COLOR_ESTADO[e]}"/>
      <text x="${x + barW/2}" y="${y - 5}" text-anchor="middle" font-size="13" font-weight="600" fill="#c8d8e0">${val}</text>
      <text x="${x + barW/2}" y="${chartH + 16}" text-anchor="middle" font-size="9" fill="#7a9aa8">${e}</text>
    </g>`;
  }).join('');

  const filasTop5 = top5.length
    ? top5.map((p,i) => `<tr>
        <td style="padding:6px 8px;color:#7a9aa8;font-size:11px;">${i+1}</td>
        <td style="padding:6px 8px;font-size:12px;color:#c8d8e0;">${esc(p.numero)} -- ${esc(p.titulo)}</td>
        <td style="padding:6px 8px;font-size:12px;color:#c8d8e0;text-align:right;">${fmtPesos(costoSubproy(p))}</td>
        <td style="padding:6px 8px;font-size:11px;color:#7a9aa8;">${esc(p.estado)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="padding:12px;color:#7a9aa8;font-size:12px;text-align:center;">Sin datos</td></tr>`;

  const filasCat = catsSorted.length
    ? catsSorted.map(([cat, d]) => `<tr>
        <td style="padding:6px 8px;font-size:12px;color:#c8d8e0;">${esc(cat)}</td>
        <td style="padding:6px 8px;font-size:12px;color:#c8d8e0;text-align:center;">${d.cant}</td>
        <td style="padding:6px 8px;font-size:12px;color:#c8d8e0;text-align:right;">${fmtPesos(d.costo)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;color:#7a9aa8;font-size:12px;text-align:center;">Sin datos</td></tr>`;

  const html = `
  <div class="card">
    <div class="ch"><span class="ct">Subproyectos por estado</span></div>
    <div class="card-body">
      <svg viewBox="0 0 ${totalW} ${chartH + 30}" width="100%" style="max-width:520px;display:block;margin:0 auto;">
        ${barsSVG}
      </svg>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Costos</span></div>
    <div class="card-body">
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div class="stat-box"><div class="stat-label">Total general</div><div class="stat-val">${fmtPesos(costoTotal)}</div></div>
        <div class="stat-box"><div class="stat-label">En curso</div><div class="stat-val">${fmtPesos(costoEnCurso)}</div></div>
        <div class="stat-box"><div class="stat-label">Finalizados</div><div class="stat-val">${fmtPesos(costoFin)}</div></div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Top 5 por costo</span></div>
    <div class="card-body" style="padding:0">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:left;">#</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:left;">Subproyecto</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:right;">Costo</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:left;">Estado</th>
        </tr></thead>
        <tbody>${filasTop5}</tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Por categoria</span></div>
    <div class="card-body" style="padding:0">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:left;">Categoria</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:center;">Cantidad</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:right;">Costo total</th>
        </tr></thead>
        <tbody>${filasCat}</tbody>
      </table>
    </div>
  </div>`;

  document.getElementById('content').innerHTML = html;
}

function exportarReporteXLSX(){
  const ps = DB.proyectosHA || [];
  const cols = ['Numero','Titulo','Estado','Categoria','Rubro','Costo','FechaInicio','FechaEstFin','FechaFinReal','Dispositivos'];
  const rows = ps.map(p => [
    p.numero, p.titulo, p.estado, p.categoria||'', p.rubro||'',
    costoSubproy(p), p.fechaInicio||'', p.fechaEstFin||'', p.fechaFinReal||'',
    p.dispositivos||''
  ]);

  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  script.onload = function(){
    const wb = XLSX.utils.book_new();
    const wsData = [cols, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // ancho de columnas
    ws['!cols'] = [8,32,14,16,14,12,12,12,12,20].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, 'Subproyectos');
    XLSX.writeFile(wb, `mini-ha-reporte-${new Date().toISOString().slice(0,10)}.xlsx`);
  };
  script.onerror = function(){ alert('Error cargando SheetJS. Verificar conexion.'); };
  document.head.appendChild(script);
}

// ── BACKUP ────────────────────────────────────────────────────────────────────
function renderBackup(){
  document.getElementById('pacts').innerHTML = '';
  const catInfo = DB.catalogoVSS.length
    ? `<span class="green">${DB.catalogoVSS.length} componentes cargados</span>`
    : `<span class="amber">Sin catálogo importado</span>`;
  const html = `<div class="card">
    <div class="ch"><span class="ct">Catálogo VSS Logística</span></div>
    <div class="card-body">
      <p class="text2" style="font-size:12px;margin-bottom:8px">Estado: ${catInfo}</p>
      <p class="text2" style="font-size:11px;margin-bottom:12px">Exportá el backup JSON desde VSS Logística e importalo acá para tener el catálogo disponible al cargar materiales.</p>
      <input type="file" id="cat-file" accept=".json" style="display:none" onchange="importarCatalogoVSS(event)">
      <button class="btn btn-p" onclick="document.getElementById('cat-file').click()">⬆️ Importar catálogo VSS</button>
      ${DB.catalogoVSS.length ? `<button class="btn btn-d" onclick="limpiarCatalogo()" style="margin-left:8px">🗑️ Limpiar catálogo</button>` : ''}
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Backup Mini HA</span></div>
    <div class="card-body">
      <p class="text2" style="font-size:12px;margin-bottom:12px">Exportá o restaurá todos los datos de Mini HA.</p>
      <button class="btn btn-p" onclick="exportarBackup()">⬇️ Exportar JSON</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Caché y Service Worker</span></div>
    <div class="card-body">
      <p class="text2" style="font-size:12px;margin-bottom:12px">Si la app no refleja los últimos cambios, limpiá el caché y recargá.</p>
      <button class="btn btn-d" onclick="limpiarCache()">🔄 Limpiar caché y recargar</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Restaurar</span></div>
    <div class="card-body">
      <p class="text2" style="font-size:12px;margin-bottom:12px"><strong class="red">Reemplaza todos los datos actuales.</strong></p>
      <input type="file" id="bk-file" accept=".json" style="display:none" onchange="importarBackup(event)">
      <button class="btn btn-d" onclick="document.getElementById('bk-file').click()">⬆️ Restaurar backup</button>
    </div>
  </div>`;
  document.getElementById('content').innerHTML = html;
}

function limpiarCatalogo(){
  if(!confirm('¿Limpiar el catálogo VSS? No afecta los materiales ya registrados.')) return;
  DB.catalogoVSS = [];
  save();
  renderBackup();
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function abrirModal(title, body, foot){
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-foot').innerHTML = foot;
  document.getElementById('modal').style.display = 'flex';
}

function cerrarModal(){
  document.getElementById('modal').style.display = 'none';
}

// ── CACHE ─────────────────────────────────────────────────────────────────────
function limpiarCache(){
  if(!confirm('¿Limpiar caché y recargar la app?')) return;
  Promise.all([
    navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))) : Promise.resolve(),
    caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : Promise.resolve()
  ]).then(() => location.reload(true));
}

// ── SPLASH ────────────────────────────────────────────────────────────────────
function mostrarSplash(){
  const ahora = new Date();
  const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const meses = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const dia = diasSemana[ahora.getDay()];
  const fecha = `${dia} ${String(ahora.getDate()).padStart(2,'0')}/${meses[ahora.getMonth()]}/${ahora.getFullYear()}`;
  const hora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;

  const el = document.createElement('div');
  el.id = 'splash';
  el.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;
    background:#111318;
    display:flex;flex-direction:column;
    font-family:system-ui,sans-serif;
  `;
  el.innerHTML = `
    <div style="background:#1e2128;border-bottom:1px solid rgba(255,255,255,0.08);padding:10px 18px;display:flex;align-items:center;gap:10px;">
      <div style="width:32px;height:32px;background:#00838f;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🏠</div>
      <div>
        <div style="font-weight:700;font-size:13px;color:#e0e0e0;">Mini HA</div>
        <div style="font-size:10px;color:#7a9aa8;">Home Assistant</div>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 2rem;">
      <div style="margin-bottom:2.5rem;text-align:center;">
        <div style="font-size:26px;font-weight:500;letter-spacing:0.03em;color:#c8d8e0;line-height:1.4;">Sistema de gestión de mini proyectos</div>
      </div>
      <div style="width:100%;max-width:400px;margin-bottom:1rem;">
        <div style="position:relative;height:1px;background:#2a2e35;">
          <div id="splash-bar" style="position:absolute;top:0;left:0;height:100%;width:0%;background:#00838f;transition:width 5s linear;"></div>
        </div>
      </div>
      <div style="text-align:center;width:100%;max-width:400px;">
        <div style="display:flex;align-items:center;justify-content:center;gap:1rem;font-size:10px;color:#5a7a85;font-family:monospace;letter-spacing:0.05em;">
          <span style="color:#7a9aa8;">Mini HA</span>
          <span style="opacity:0.3;">·</span>
          <span>${fecha}</span>
          <span style="opacity:0.3;">·</span>
          <span>${hora}</span>
          <span style="opacity:0.3;">·</span>
          <span>${VERSION}</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  setTimeout(() => {
    const bar = document.getElementById('splash-bar');
    if(bar) bar.style.width = '100%';
  }, 50);

  setTimeout(() => {
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, 5000);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  mostrarSplash();
  load();
  goTo('dashboard');
});
