'use strict';

// ── CONSTANTES ────────────────────────────────────────────────────────────────
const SKEY = 'mini-ha';
const VERSION = 'v1.08';

// ── File System Access API ────────────────────────────────────────────────────
let _dirHandle = null;
let _folderSaveTimer = null;

const MHA_IDB_NAME  = 'mini-ha-fs';
const MHA_IDB_STORE = 'handles';
const MHA_IDB_KEY   = 'carpeta-backup';

function mhaAbrirIDB(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open(MHA_IDB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(MHA_IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function mhaGuardarHandleIDB(handle){
  try{
    const db = await mhaAbrirIDB();
    const tx = db.transaction(MHA_IDB_STORE,'readwrite');
    tx.objectStore(MHA_IDB_STORE).put(handle, MHA_IDB_KEY);
    await new Promise((res,rej)=>{ tx.oncomplete=res; tx.onerror=rej; });
    db.close();
  } catch(e){ console.warn('IDB write:',e); }
}

async function mhaLeerHandleIDB(){
  try{
    const db = await mhaAbrirIDB();
    const tx = db.transaction(MHA_IDB_STORE,'readonly');
    const h = await new Promise((res,rej)=>{
      const r = tx.objectStore(MHA_IDB_STORE).get(MHA_IDB_KEY);
      r.onsuccess = e => res(e.target.result);
      r.onerror   = e => rej(e.target.error);
    });
    db.close();
    return h || null;
  } catch(e){ return null; }
}

async function mhaRestaurarCarpetaGuardada(){
  if(!('showDirectoryPicker' in window)) return;
  const handle = await mhaLeerHandleIDB();
  if(!handle) return;
  try{
    const perm = await handle.queryPermission({ mode:'readwrite' });
    if(perm === 'granted'){
      _dirHandle = handle;
      mhaActualizarEstadoCarpeta();
    } else if(perm === 'prompt'){
      _dirHandle = handle;
      window._pendingHandle = handle;
    }
  } catch(e){ console.warn('restaurarCarpeta:',e); }
}

function mhaActualizarEstadoCarpeta(){
  const el = document.getElementById('mha-carpeta-status');
  if(!el) return;
  if(_dirHandle){
    el.textContent = '📂 ' + _dirHandle.name;
    el.style.color = '#4caf7d';
  } else {
    el.textContent = 'Sin carpeta vinculada';
    el.style.color = 'var(--text3)';
  }
}

async function mhaSeleccionarCarpeta(){
  if(!('showDirectoryPicker' in window)){
    alert('Tu browser no soporta esta función. Usá Chrome o Brave.');
    return;
  }
  try{
    if(window._pendingHandle){
      try{
        const perm = await window._pendingHandle.requestPermission({ mode:'readwrite' });
        if(perm === 'granted'){
          _dirHandle = window._pendingHandle;
          window._pendingHandle = null;
          await mhaGuardarHandleIDB(_dirHandle);
          mhaActualizarEstadoCarpeta();
          await mhaGuardarEnCarpeta();
          return;
        }
      } catch(ep){}
      window._pendingHandle = null;
    }
    _dirHandle = await window.showDirectoryPicker({ mode:'readwrite' });
    await mhaGuardarHandleIDB(_dirHandle);
    mhaActualizarEstadoCarpeta();
    await mhaGuardarEnCarpeta();
  } catch(e){
    if(e.name !== 'AbortError') console.error('seleccionarCarpeta:',e);
  }
}

async function mhaGuardarEnCarpeta(){
  if(!_dirHandle) return false;
  try{
    const perm = await _dirHandle.queryPermission({ mode:'readwrite' });
    if(perm === 'prompt'){
      const granted = await _dirHandle.requestPermission({ mode:'readwrite' });
      if(granted !== 'granted') return false;
      mhaActualizarEstadoCarpeta();
    } else if(perm !== 'granted') return false;

    const hoy    = new Date().toISOString().slice(0,10);
    const nombre = `mini-ha_backup_${hoy}.json`;
    const fh     = await _dirHandle.getFileHandle(nombre, { create:true });
    const wr     = await fh.createWritable();
    await wr.write(JSON.stringify(DB, null, 2));
    await wr.close();
    console.log('Backup carpeta guardado:', nombre);

    // Limpiar backups >7 días
    const limite = new Date();
    limite.setDate(limite.getDate() - 7);
    for await (const [name] of _dirHandle.entries()){
      if(/^mini-ha_backup_\d{4}-\d{2}-\d{2}\.json$/.test(name)){
        const fechaArch = new Date(name.slice(12,22));
        if(fechaArch < limite) try{ await _dirHandle.removeEntry(name); } catch(ed){}
      }
    }
    return true;
  } catch(e){
    console.error('guardarEnCarpeta:',e.name, e.message);
    return false;
  }
}

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
  // Backup carpeta con debounce 5s
  if(_dirHandle){
    clearTimeout(_folderSaveTimer);
    _folderSaveTimer = setTimeout(()=>mhaGuardarEnCarpeta(), 5000);
  }
}

// ── SNAPSHOTS ─────────────────────────────────────────────────────────────────
const SKEY_SNAPS = 'mini-ha-snaps';
const MAX_SNAPS = 10;

function mhaCargarSnaps(){
  try{ return JSON.parse(localStorage.getItem(SKEY_SNAPS)||'[]'); }
  catch(e){ return []; }
}

function mhaHacerSnapshot(manual=false){
  try{
    const snaps = mhaCargarSnaps();
    snaps.unshift({ ts: Date.now(), manual, label: manual?'Manual':'Auto', data: JSON.stringify(DB) });
    while(snaps.length > MAX_SNAPS) snaps.pop();
    localStorage.setItem(SKEY_SNAPS, JSON.stringify(snaps));
    return true;
  } catch(e){ return false; }
}

function mhaRestaurarSnapshot(ts){
  const snaps = mhaCargarSnaps();
  const snap = snaps.find(s => s.ts === ts);
  if(!snap) return;
  if(!confirm('¿Restaurar este snapshot? Se reemplazarán los datos actuales.')) return;
  try{
    DB = JSON.parse(snap.data);
    save();
    goTo('dashboard');
  } catch(e){ alert('Error al restaurar: '+e.message); }
}

function mhaEliminarSnapshot(ts){
  const snaps = mhaCargarSnaps().filter(s => s.ts !== ts);
  localStorage.setItem(SKEY_SNAPS, JSON.stringify(snaps));
  renderBackup();
}

async function mhaSalir(){
  const ok = mhaHacerSnapshot(true);
  if(_dirHandle) await mhaGuardarEnCarpeta();
  const msg = ok ? '✅ Snapshot guardado.' : '⚠️ No se pudo guardar snapshot.';
  const carpetaMsg = _dirHandle ? `\n📂 Backup en carpeta "${_dirHandle.name}" guardado.` : '';
  if(confirm(msg + carpetaMsg + '\n¿Cerrar Mini HA?')) window.close();
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
const PANELS = ['dashboard','proyectos','proy-ficha','reportes','stock','config','backup'];
let _panel = 'dashboard';
let _proyActual = null; // id del subproyecto abierto

function toggleNav(){
  const nav = document.getElementById('nav');
  const overlay = document.getElementById('nav-overlay');
  if(!nav) return;
  nav.classList.toggle('open');
  if(overlay) overlay.classList.toggle('open');
}

function cerrarNav(){
  const nav = document.getElementById('nav');
  const overlay = document.getElementById('nav-overlay');
  if(nav) nav.classList.remove('open');
  if(overlay) overlay.classList.remove('open');
}

function goTo(panel, extra){
  cerrarNav();
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
    'stock':      'Stock VSS',
    'config':     'Configuración',
    'backup':     'Backup / Restaurar'
  };
  document.getElementById('ptitle').textContent = titles[panel] || panel;

  const renders = {
    'dashboard':  renderDashboard,
    'proyectos':  renderProyectos,
    'proy-ficha': () => renderFicha(_proyActual),
    'reportes':   renderReportes,
    'stock':      renderStock,
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

  const horasEst  = DB.proyectosHA.reduce((a,p)=>a+(p.operaciones||[]).reduce((b,o)=>b+(o.tiempoEst||0),0),0);
  const horasReal = DB.proyectosHA.reduce((a,p)=>a+(p.operaciones||[]).reduce((b,o)=>b+(o.tiempoReal||0),0),0);
  const horasEstAct  = activos.reduce((a,p)=>a+(p.operaciones||[]).reduce((b,o)=>b+(o.tiempoEst||0),0),0);
  const horasRealAct = activos.reduce((a,p)=>a+(p.operaciones||[]).reduce((b,o)=>b+(o.tiempoReal||0),0),0);

  let html = `
  <div class="stats">
    <div class="stat"><div class="stat-n blue">${total}</div><div class="stat-l">Total</div></div>
    <div class="stat"><div class="stat-n" style="color:var(--primary-light)">${activos.length}</div><div class="stat-l">En curso</div></div>
    <div class="stat"><div class="stat-n amber">${planif.length}</div><div class="stat-l">Planificados</div></div>
    <div class="stat"><div class="stat-n amber">${pausados.length}</div><div class="stat-l">Pausados</div></div>
    <div class="stat"><div class="stat-n green">${finalizados.length}</div><div class="stat-l">Finalizados</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-n" style="color:var(--primary-light)">${horasEst}hs</div><div class="stat-l">Total est.</div></div>
    <div class="stat"><div class="stat-n green">${horasReal}hs</div><div class="stat-l">Total real</div></div>
    <div class="stat"><div class="stat-n" style="color:var(--primary-light)">${horasEstAct}hs</div><div class="stat-l">En curso est.</div></div>
    <div class="stat"><div class="stat-n green">${horasRealAct}hs</div><div class="stat-l">En curso real</div></div>
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
  const COLOR_CARD = {
    'Planificado':'#5a8fc4',
    'En curso':   '#00838f',
    'Pausado':    '#c4955a',
    'Finalizado': '#4caf7d',
    'Cancelado':  '#888'
  };
  const borderColor = COLOR_CARD[p.estado] || '#444';
  return `<div class="proy-card" onclick="abrirProyecto(${p.id})" style="border-left:4px solid ${borderColor}">
    <div class="proy-card-num" style="color:#c0392b">${esc(p.numero)}</div>
    <div class="proy-card-title">${esc(p.titulo)}</div>
    <div class="proy-card-obj">${esc(p.objetivo||'')}</div>
    <div class="proy-progress"><div class="proy-progress-bar" style="width:${pct}%"></div></div>
    <div class="proy-card-footer">
      ${pill(p.estado)}
      <span class="proy-card-cat text3">${esc(p.categoria||'')}</span>
      <span class="text3" style="font-size:10px">${pct}%</span>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:4px;display:flex;gap:8px;">
      <span>&#9201; Est: <b style="color:var(--primary-light)">${(p.operaciones||[]).reduce((a,o)=>a+(o.tiempoEst||0),0)}hs</b></span>
      <span>&#10003; Real: <b style="color:#4caf7d">${(p.operaciones||[]).reduce((a,o)=>a+(o.tiempoReal||0),0)}hs</b></span>
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
        <td class="mono" style="font-size:10px;color:#c0392b">${esc(p.numero)}</td>
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
    <div class="ficha-num" style="color:#c0392b">${esc(p.numero)}</div>
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
      <span style="font-size:11px;color:var(--text3);margin-left:auto;margin-right:8px;">&#9201; Est: <b style="color:var(--primary-light)">${(p.operaciones||[]).reduce((a,o)=>a+(o.tiempoEst||0),0)}hs</b> &nbsp;&middot;&nbsp; &#10003; Real: <b style="color:#4caf7d">${(p.operaciones||[]).reduce((a,o)=>a+(o.tiempoReal||0),0)}hs</b></span>
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

  // Cierres / aprendizajes
  {
    const cierres = p.cierres || [];
    html += `<div class="card">
      <div class="ch"><span class="ct">Registros de cierre</span></div>
      <div class="card-body">
        ${cierres.length ? cierres.slice().reverse().map(c => `
          <div style="border-bottom:1px solid var(--border);padding:10px 0;margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:10px;color:var(--text3)">${fmtFecha(c.fecha)}</span>
              ${pill(c.estado)}
            </div>
            ${c.razon ? `<div style="margin-bottom:6px"><span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.05em">Razon</span><div style="font-size:12px;color:var(--text1);margin-top:3px">${esc(c.razon)}</div></div>` : ''}
            ${c.aprendizajes ? `<div><span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.05em">Aprendizajes</span><div style="font-size:12px;color:var(--text1);margin-top:3px">${esc(c.aprendizajes)}</div></div>` : ''}
          </div>`
        ).join('') : '<div class="empty" style="padding:12px;font-size:12px">Sin registros de cierre aun.</div>'}
      </div>
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
        ${p.historial.length > 20 ? `<div class="text3" style="font-size:10px;margin-top:6px">... y ${p.historial.length-20} entradas mas</div>` : ''}
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

  // Agrupar por sección
  const secciones = [];
  const secMap = {};
  p.operaciones.forEach((op, i) => {
    const sec = op.seccion || 'General';
    if(!secMap[sec]){ secMap[sec] = []; secciones.push(sec); }
    secMap[sec].push({ op, i });
  });

  return secciones.map(sec => {
    const items = secMap[sec];
    const total = items.length;
    const hechas = items.filter(x => x.op.hecha).length;
    const secHeader = secciones.length > 1
      ? `<div style="font-size:11px;font-weight:700;color:var(--primary-light);text-transform:uppercase;letter-spacing:0.08em;padding:8px 0 4px;border-bottom:1px solid var(--border);margin-bottom:4px">${esc(sec)} <span style="font-weight:400;color:var(--text3)">${hechas}/${total}</span></div>`
      : '';

    const opsHtml = items.map(({op, i}, posEnSec) => {
      // Bloqueo secuencial dentro de la misma sección
      const prevEnSec = posEnSec > 0 ? items[posEnSec-1].op : null;
      const bloqueada = prevEnSec !== null && !prevEnSec.hecha;
      const itemCls = op.hecha ? 'hecha' : (bloqueada ? 'bloqueada' : '');
      const descCls = op.hecha ? 'hecha' : '';
      const lockTip = bloqueada ? ` title="Completá la operación anterior de esta sección primero"` : '';
      return `<div class="op-item ${itemCls}" id="op-${p.id}-${i}">
        <span class="op-num">${i+1}</span>
        <input type="checkbox" ${op.hecha?'checked':''} ${bloqueada?'disabled':''} onchange="toggleOp(${p.id},${i})"${lockTip}>
        <span class="op-desc ${descCls}">${esc(op.desc)}${bloqueada?' <span class="op-lock">&#128274;</span>':''}</span>
        ${op.nota ? `<div style="font-size:11px;color:var(--text3);margin:2px 0 0 28px;font-style:italic"><span style="color:var(--primary);margin-right:4px">📋</span>${esc(op.nota)}</div>` : ''}
        ${(op.tiempoEst||op.tiempoReal) ? `<div style="font-size:10px;color:var(--text3);margin:3px 0 0 28px;display:flex;gap:10px;"><span>⏱ Est: <b style="color:var(--primary-light)">${op.tiempoEst||0}hs</b></span><span>✅ Real: <b style="color:#4caf7d">${op.tiempoReal||0}hs</b></span></div>` : ''}
        <div class="op-actions">
          <button class="btn btn-sm" onclick="moverOp(${p.id},${i},-1)" ${posEnSec===0?'disabled':''}>↑</button>
          <button class="btn btn-sm" onclick="moverOp(${p.id},${i},1)" ${posEnSec===items.length-1?'disabled':''}>↓</button>
          <button class="btn btn-sm" onclick="modalEditarOp(${p.id},${i})" title="Editar operación">✏️</button>
          <button class="btn btn-sm btn-d" onclick="eliminarOp(${p.id},${i})">✕</button>
        </div>
      </div>`;
    }).join('');

    return `<div style="margin-bottom:${secciones.length > 1 ? '12px' : '0'}">${secHeader}${opsHtml}</div>`;
  }).join('');
}

// ── OPERACIONES ───────────────────────────────────────────────────────────────
function toggleOp(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p || !p.operaciones[idx]) return;
  p.operaciones[idx].hecha = !p.operaciones[idx].hecha;
  agregarHistorial(p, `Operacion ${idx+1} "${p.operaciones[idx].desc}" ${p.operaciones[idx].hecha ? "completada" : "desmarcada"}`);
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
  const seccion = ops[idx].seccion || 'General';
  const newIdx = idx + dir;
  // Solo mover dentro de la misma sección
  if(newIdx < 0 || newIdx >= ops.length) return;
  if((ops[newIdx].seccion || 'General') !== seccion) return;
  [ops[idx], ops[newIdx]] = [ops[newIdx], ops[idx]];
  save();
  const cont = document.getElementById('ficha-ops');
  if(cont) cont.innerHTML = renderOps(p);
}

function modalEditarNota(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p || !p.operaciones[idx]) return;
  const op = p.operaciones[idx];
  abrirModal('Nota de operacion',
    `<div style="font-size:12px;color:var(--text2);margin-bottom:10px;font-weight:600">${esc(op.desc)}</div>
     <div class="fg">
       <label>Nota / detalle</label>
       <textarea id="edit-nota" rows="4" placeholder="Detalle especifico...">${esc(op.nota||'')}</textarea>
     </div>`,
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarNota(${proyId},${idx})">Guardar</button>`
  );
}

function guardarNota(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p || !p.operaciones[idx]) return;
  p.operaciones[idx].nota = (document.getElementById('edit-nota').value||'').trim();
  agregarHistorial(p, `Nota editada en operacion ${idx+1}`);
  save();
  cerrarModal();
  const cont = document.getElementById('ficha-ops');
  if(cont) cont.innerHTML = renderOps(p);
}

function modalEditarOp(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p || !p.operaciones[idx]) return;
  const op = p.operaciones[idx];
  const secsExist = [...new Set((p.operaciones||[]).map(o => o.seccion || 'General'))];
  const secOpts = secsExist.map(s => `<option value="${esc(s)}" ${s===(op.seccion||'General')?'selected':''}>${esc(s)}</option>`).join('');
  abrirModal('Editar operacion',
    `<div class="fg">
       <label>Seccion</label>
       <select id="eop-sec">${secOpts}</select>
     </div>
     <div class="fg">
       <label>Descripcion</label>
       <input id="eop-desc" value="${esc(op.desc)}">
     </div>
     <div class="fg">
       <label>Nota / detalle</label>
       <textarea id="eop-nota" rows="2">${esc(op.nota||'')}</textarea>
     </div>
     <div style="display:flex;gap:12px;">
       <div class="fg" style="flex:1"><label>Tiempo estimado (hs)</label><input id="eop-test" type="number" min="0" step="0.5" value="${op.tiempoEst||0}"></div>
       <div class="fg" style="flex:1"><label>Tiempo real (hs)</label><input id="eop-treal" type="number" min="0" step="0.5" value="${op.tiempoReal||0}"></div>
     </div>`,
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarEditarOp(${proyId},${idx})">Guardar</button>`
  );
}

function guardarEditarOp(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p || !p.operaciones[idx]) return;
  const op = p.operaciones[idx];
  const desc = (document.getElementById('eop-desc').value||'').trim();
  if(!desc){ alert('La descripcion no puede estar vacia.'); return; }
  op.desc = desc;
  op.seccion = document.getElementById('eop-sec').value || 'General';
  op.nota = (document.getElementById('eop-nota').value||'').trim();
  op.tiempoEst = parseFloat(document.getElementById('eop-test').value)||0;
  op.tiempoReal = parseFloat(document.getElementById('eop-treal').value)||0;
  agregarHistorial(p, `Operacion editada: "${desc}"`);
  save();
  cerrarModal();
  const cont = document.getElementById('ficha-ops');
  if(cont) cont.innerHTML = renderOps(p);
}

function eliminarOp(proyId, idx){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  if(!confirm('¿Eliminar esta operación?')) return;
  const descOp = p.operaciones[idx].desc;
  p.operaciones.splice(idx, 1);
  agregarHistorial(p, `Operacion eliminada: "${descOp}"`);
  save();
  const cont = document.getElementById('ficha-ops');
  if(cont) cont.innerHTML = renderOps(p);
}

function modalNuevaOp(proyId){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  const plantillas = (DB.config.plantillas || []).slice().sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));

  // Secciones existentes en el proyecto
  const secsExist = [...new Set((p.operaciones||[]).map(o => o.seccion || 'General'))];
  const secOpts = secsExist.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');

  const opts = plantillas.map(pl =>
    `<option value="${esc(pl)}">${esc(pl)}</option>`
  ).join('');

  abrirModal('Agregar operacion',
    `<div class="fg">
       <label>Seccion</label>
       <select id="op-sec" onchange="toggleSecNueva()">
         ${secsExist.length ? secOpts : '<option value="General">General</option>'}
         <option value="__nueva__">+ Nueva seccion...</option>
       </select>
     </div>
     <div class="fg" id="op-sec-nueva-wrap" style="display:none">
       <label>Nombre de la nueva seccion</label>
       <input id="op-sec-nueva" placeholder="Ej: Instalacion fisica">
     </div>
     <div class="fg">
       <label>Operacion</label>
       <select id="op-sel" onchange="toggleOpOtro()">
         <option value="">-- seleccionar --</option>
         ${opts}
         <option value="__otro__">Otro...</option>
       </select>
     </div>
     <div class="fg" id="op-otro-wrap" style="display:none">
       <label>Descripcion</label>
       <input id="op-desc" placeholder="Escribi la operacion...">
     </div>
     <div class="fg">
       <label>Nota / detalle <span style="font-weight:400;color:var(--text3)">(opcional)</span></label>
       <textarea id="op-nota" rows="2" placeholder="Detalle especifico de esta operacion..."></textarea>
     </div>
     <div style="display:flex;gap:12px;">
       <div class="fg" style="flex:1"><label>Tiempo estimado (hs)</label><input id="op-test" type="number" min="0" step="0.5" placeholder="0"></div>
       <div class="fg" style="flex:1"><label>Tiempo real (hs)</label><input id="op-treal" type="number" min="0" step="0.5" placeholder="0"></div>
     </div>`,
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarNuevaOp(${proyId})">Agregar</button>`
  );
}

function toggleSecNueva(){
  const sel = document.getElementById('op-sec');
  const wrap = document.getElementById('op-sec-nueva-wrap');
  if(!sel || !wrap) return;
  wrap.style.display = sel.value === '__nueva__' ? '' : 'none';
  if(sel.value === '__nueva__') document.getElementById('op-sec-nueva').focus();
}

function toggleOpOtro(){
  const sel = document.getElementById('op-sel');
  const wrap = document.getElementById('op-otro-wrap');
  if(!sel || !wrap) return;
  wrap.style.display = sel.value === '__otro__' ? '' : 'none';
  if(sel.value === '__otro__') document.getElementById('op-desc').focus();
}

function guardarNuevaOp(proyId){
  const p = DB.proyectosHA.find(x => x.id === proyId);
  if(!p) return;
  if(!p.operaciones) p.operaciones = [];

  const sel = document.getElementById('op-sel');
  const val = sel ? sel.value : '';

  let desc = '';
  if(val === '__otro__'){
    desc = (document.getElementById('op-desc').value||'').trim();
    if(!desc){ alert('Escribi la descripcion.'); return; }
    if(!DB.config.plantillas) DB.config.plantillas = [];
    if(!DB.config.plantillas.includes(desc)){
      DB.config.plantillas.push(desc);
    }
  } else {
    desc = val.trim();
  }

  if(!desc){ alert('Selecciona una operacion.'); return; }

  // Sección
  const secSel = document.getElementById('op-sec');
  let seccion = secSel ? secSel.value : 'General';
  if(seccion === '__nueva__'){
    seccion = (document.getElementById('op-sec-nueva').value||'').trim() || 'General';
  }

  const nota = (document.getElementById('op-nota')||{value:''}).value.trim();
  const tEst = parseFloat((document.getElementById('op-test')||{value:''}).value)||0;
  const tReal = parseFloat((document.getElementById('op-treal')||{value:''}).value)||0;
  p.operaciones.push({ desc, nota, seccion, hecha: false, tiempoEst: tEst, tiempoReal: tReal });
  agregarHistorial(p, `Operacion agregada en "${seccion}": "${desc}"`);
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
  const ESTADOS_CIERRE = ['Finalizado','Cancelado','Pausado'];
  abrirModal('Cambiar estado',
    `<div class="fg"><label>Estado</label><select id="ce-estado" onchange="toggleCierreFields()">${opts}</select></div>
     <div id="ce-cierre-wrap" style="display:none">
       <div class="fg"><label>Razon del cierre</label><textarea id="ce-razon" rows="2" placeholder="Por que se cierra, suspende o cancela..."></textarea></div>
       <div class="fg"><label>Aprendizajes</label><textarea id="ce-aprend" rows="2" placeholder="Que aprendimos, que hariamos diferente..."></textarea></div>
     </div>
     <div class="fg"><label>Nota (opcional)</label><input id="ce-nota" placeholder="Motivo del cambio..."></div>`,
    `<button class="btn" onclick="cerrarModal()">Cancelar</button>
     <button class="btn btn-p" onclick="guardarEstado(${id})">Guardar</button>`
  );
  // Mostrar campos si el estado actual ya es de cierre
  setTimeout(() => toggleCierreFields(), 50);
}

function toggleCierreFields(){
  const sel = document.getElementById('ce-estado');
  const wrap = document.getElementById('ce-cierre-wrap');
  if(!sel || !wrap) return;
  const ESTADOS_CIERRE = ['Finalizado','Cancelado','Pausado'];
  wrap.style.display = ESTADOS_CIERRE.includes(sel.value) ? '' : 'none';
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

  // Registro de cierre
  const ESTADOS_CIERRE = ['Finalizado','Cancelado','Pausado'];
  if(ESTADOS_CIERRE.includes(nuevo)){
    const razon  = (document.getElementById('ce-razon').value||'').trim();
    const aprend = (document.getElementById('ce-aprend').value||'').trim();
    if(razon || aprend){
      if(!p.cierres) p.cierres = [];
      p.cierres.push({
        fecha: today(),
        estado: nuevo,
        razon,
        aprendizajes: aprend
      });
    }
  }

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
  // Merge: conservar plantillas agregadas desde operaciones que no estén en el textarea
  const plsExistentes = DB.config.plantillas || [];
  const plsMerge = [...new Set([...pls, ...plsExistentes])].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  DB.config.plantillas      = plsMerge;
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
  // Leer el archivo primero, confirmar después
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = JSON.parse(e.target.result);
      if(!data.proyectosHA) throw new Error('Archivo invalido');
      // Modal de confirmacion con palabra clave
      abrirModal('⚠️ Confirmar restauracion',
        `<div style="background:#2a1a1a;border:1px solid #c0392b;border-radius:var(--r);padding:12px;margin-bottom:16px;font-size:12px;color:#e07070">
           Esta accion reemplaza TODOS los datos actuales con el backup.<br>Esta operacion no se puede deshacer.
         </div>
         <div class="fg">
           <label>Escribi <strong>RESTAURAR</strong> para confirmar</label>
           <input id="confirm-restaurar" placeholder="RESTAURAR" autocomplete="off">
         </div>`,
        `<button class="btn" onclick="cerrarModal();document.getElementById('bk-file').value=''">Cancelar</button>
         <button class="btn" style="background:#c0392b;color:#fff;border-color:#c0392b" onclick="ejecutarRestauracion()">Restaurar</button>`
      );
      // Guardar data temporalmente
      window._pendingRestore = data;
    } catch(err){
      alert('Error al leer el archivo: '+err.message);
    }
  };
  reader.readAsText(file);
}

function ejecutarRestauracion(){
  const input = document.getElementById('confirm-restaurar');
  if(!input || input.value.trim() !== 'RESTAURAR'){
    input.style.borderColor = '#c0392b';
    input.focus();
    return;
  }
  if(!window._pendingRestore) return;
  DB = window._pendingRestore;
  window._pendingRestore = null;
  save();
  cerrarModal();
  alert('Backup restaurado correctamente.');
  goTo('dashboard');
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
    const compNombre = (DB.catalogoVSS.find(c=>c.id===compId)||{}).nombre||compId;
    p.materiales.push({ compId, cant: cantCat, notas: notasCat });
    agregarHistorial(p, `Material agregado: "${compNombre}" x${cantCat}`);
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
    agregarHistorial(p, `Material manual agregado: "${libre}" x${cantMan}`);
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
  const matDesc = p.materiales[idx].nombreLibre || (DB.catalogoVSS.find(c=>c.id===p.materiales[idx].compId)||{}).nombre || 'material';
  p.materiales.splice(idx, 1);
  agregarHistorial(p, `Material eliminado: "${matDesc}"`);
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
      // Calcular stock desde movimientos
      const movs = data.movimientos || [];
      const movArch = data.movimientosArchivados || [];
      const stockMap = {};
      [...movArch, ...movs].forEach(m => {
        const cid = m.cid || m.compId;
        if(!cid) return;
        if(!stockMap[cid]) stockMap[cid] = 0;
        stockMap[cid] += m.tipo === 'Entrada' ? (parseFloat(m.cant)||0) : -(parseFloat(m.cant)||0);
      });

      DB.catalogoVSS = comps.map(c => ({
        id:     c.id,
        codigo: c.codigo||'',
        nombre: c.desc||c.nombre||'',
        unidad: c.unidad||'',
        costo:  c.costo||0,
        stock:  stockMap[c.id] || 0
      }));
      save();
      alert(`Catalogo importado: ${DB.catalogoVSS.length} componentes. Movs: ${movs.length}, Arch: ${movArch.length}, Con stock: ${DB.catalogoVSS.filter(c=>c.stock>0).length}`);
      renderBackup();
    } catch(err){
      alert('Error al importar catálogo: '+err.message);
    }
  };
  reader.readAsText(file);
}

// ── STOCK ─────────────────────────────────────────────────────────────────────
let _stockSort = { col: 'nombre', dir: 1 };

function renderStock(){
  document.getElementById('pacts').innerHTML = '';
  const catalogo = DB.catalogoVSS || [];

  if(!catalogo.length){
    document.getElementById('content').innerHTML = `<div class="card"><div class="card-body"><div class="empty">Sin catalogo importado. Importalo desde Backup.</div></div></div>`;
    return;
  }

  renderStockTabla(catalogo);
}

function sortStock(col){
  if(_stockSort.col === col) _stockSort.dir *= -1;
  else { _stockSort.col = col; _stockSort.dir = 1; }
  renderStockTabla(DB.catalogoVSS || []);
}

function renderStockTabla(catalogo){
  const q = (document.getElementById('stock-busq')||{value:''}).value.toLowerCase();
  const filtrada = q ? catalogo.filter(c =>
    (c.nombre||'').toLowerCase().includes(q) || (c.codigo||'').toLowerCase().includes(q)
  ) : catalogo;

  const { col, dir } = _stockSort;
  const sorted = [...filtrada].sort((a,b) => {
    let va, vb;
    if(col === 'codigo')  { va = a.codigo||''; vb = b.codigo||''; return dir * va.localeCompare(vb,'es',{sensitivity:'base'}); }
    if(col === 'nombre')  { va = a.nombre||''; vb = b.nombre||''; return dir * va.localeCompare(vb,'es',{sensitivity:'base'}); }
    if(col === 'unidad')  { va = a.unidad||''; vb = b.unidad||''; return dir * va.localeCompare(vb,'es',{sensitivity:'base'}); }
    if(col === 'stock')   { return dir * ((a.stock||0) - (b.stock||0)); }
    if(col === 'costo')   { return dir * ((a.costo||0) - (b.costo||0)); }
    if(col === 'valor')   { return dir * (((a.stock||0)*(a.costo||0)) - ((b.stock||0)*(b.costo||0))); }
    return 0;
  });

  const conStock = catalogo.filter(c => (c.stock||0) > 0);
  const sinStock = catalogo.filter(c => (c.stock||0) <= 0);
  const valorTotal = catalogo.reduce((s,c) => s + (c.stock||0) * (c.costo||0), 0);

  const arr = col => {
    if(_stockSort.col !== col) return '<span style="opacity:0.25">⇅</span>';
    return _stockSort.dir === 1 ? '↑' : '↓';
  };
  const th = (label, c, align='left') =>
    `<th onclick="sortStock('${c}')" style="padding:5px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:${align};cursor:pointer;user-select:none">${label} ${arr(c)}</th>`;

  const filasStock = sorted.map(c => {
    const st = c.stock || 0;
    const valor = st * (c.costo||0);
    const stColor = st <= 0 ? '#c0392b' : st < 3 ? '#c4955a' : '#4caf7d';
    return `<tr>
      <td style="padding:5px 8px;font-size:11px;color:#7a9aa8">${esc(c.codigo||'')}</td>
      <td style="padding:5px 8px;font-size:12px;color:#c8d8e0">${esc(c.nombre)}</td>
      <td style="padding:5px 8px;font-size:11px;color:#7a9aa8;text-align:center">${esc(c.unidad||'')}</td>
      <td style="padding:5px 8px;font-size:12px;font-weight:600;text-align:center;color:${stColor}">${st}</td>
      <td style="padding:5px 8px;font-size:11px;color:#7a9aa8;text-align:right">${fmtPesos(c.costo||0)}</td>
      <td style="padding:5px 8px;font-size:12px;color:#c8d8e0;text-align:right">${fmtPesos(valor)}</td>
    </tr>`;
  }).join('');

  const prevBusq = (document.getElementById('stock-busq')||{value:''}).value;

  document.getElementById('content').innerHTML = `
  <div class="card">
    <div class="ch"><span class="ct">Resumen</span></div>
    <div class="card-body">
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div class="stat-box"><div class="stat-label">Componentes</div><div class="stat-val">${catalogo.length}</div></div>
        <div class="stat-box"><div class="stat-label">Con stock</div><div class="stat-val" style="color:#4caf7d">${conStock.length}</div></div>
        <div class="stat-box"><div class="stat-label">Sin stock</div><div class="stat-val" style="color:#c0392b">${sinStock.length}</div></div>
        <div class="stat-box"><div class="stat-label">Valor total</div><div class="stat-val">${fmtPesos(valorTotal)}</div></div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Detalle de componentes</span>
      <span style="font-size:11px;color:var(--text3)">${filtrada.length !== catalogo.length ? filtrada.length+'/'+catalogo.length : catalogo.length+' items'}</span>
    </div>
    <div class="card-body" style="padding:8px 12px">
      <input id="stock-busq" placeholder="Buscar por nombre o codigo..." value="${esc(prevBusq)}"
        oninput="renderStockTabla(DB.catalogoVSS||[])"
        style="width:100%;box-sizing:border-box;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);color:var(--text1);font-size:12px">
    </div>
    <div class="card-body" style="padding:0">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--border)">
          ${th('Cod','codigo')}
          ${th('Componente','nombre')}
          ${th('Unid','unidad','center')}
          ${th('Stock','stock','center')}
          ${th('Costo u.','costo','right')}
          ${th('Valor','valor','right')}
        </tr></thead>
        <tbody>${filasStock || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#7a9aa8;font-size:12px">Sin resultados</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;

  // Restaurar foco del buscador
  if(prevBusq){
    const inp = document.getElementById('stock-busq');
    if(inp){ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }
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

  let html = `
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

  // ── Sección Operaciones
  const todasOps = [];
  ps.forEach(p => {
    (p.operaciones||[]).forEach(op => {
      todasOps.push({ desc: op.desc, hecha: op.hecha, proyecto: p.numero });
    });
  });

  const totalOpsCreadas = todasOps.length;
  const totalOpsHechas = todasOps.filter(o => o.hecha).length;
  const pctOpsGlobal = totalOpsCreadas ? Math.round(totalOpsHechas/totalOpsCreadas*100) : 0;

  // Ranking por frecuencia
  const rankMap = {};
  todasOps.forEach(o => {
    const k = o.desc;
    if(!rankMap[k]) rankMap[k] = { desc: k, usos: 0, hechas: 0 };
    rankMap[k].usos++;
    if(o.hecha) rankMap[k].hechas++;
  });
  const ranking = Object.values(rankMap).sort((a,b) => b.usos - a.usos);

  const filasRanking = ranking.length ? ranking.map((r,i) => {
    const pct = Math.round(r.hechas/r.usos*100);
    return `<tr>
      <td style="padding:6px 8px;color:#7a9aa8;font-size:11px">${i+1}</td>
      <td style="padding:6px 8px;font-size:12px;color:#c8d8e0">${esc(r.desc)}</td>
      <td style="padding:6px 8px;font-size:12px;color:#c8d8e0;text-align:center">${r.usos}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:center">
        <span style="color:${pct===100?'#4caf7d':pct>50?'#c4955a':'#7a9aa8'}">${pct}%</span>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="4" style="padding:12px;color:#7a9aa8;font-size:12px;text-align:center">Sin operaciones registradas</td></tr>';

  // Plantillas vs uso real
  const plantillas = DB.config.plantillas || [];
  const filasPlantillas = plantillas.length ? [...plantillas].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).map(pl => {
    const usos = todasOps.filter(o => o.desc === pl).length;
    const sinUso = usos === 0;
    return `<tr style="${sinUso?'opacity:0.5':''}">
      <td style="padding:6px 8px;font-size:12px;color:${sinUso?'#7a9aa8':'#c8d8e0'}">${esc(pl)}</td>
      <td style="padding:6px 8px;font-size:12px;text-align:center;color:${sinUso?'#7a9aa8':'#c8d8e0'}">${usos}</td>
      <td style="padding:6px 8px;text-align:center">
        ${sinUso ? `<button class="btn btn-sm btn-d" onclick="eliminarPlantilla(${JSON.stringify(pl)})">✕</button>` : ''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="3" style="padding:12px;color:#7a9aa8;font-size:12px;text-align:center">Sin plantillas definidas</td></tr>';

  html += `
  <div class="card">
    <div class="ch"><span class="ct">Operaciones — indicador global</span></div>
    <div class="card-body">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <div class="stat-box"><div class="stat-label">Creadas</div><div class="stat-val">${totalOpsCreadas}</div></div>
        <div class="stat-box"><div class="stat-label">Completadas</div><div class="stat-val">${totalOpsHechas}</div></div>
        <div class="stat-box"><div class="stat-label">% completado</div><div class="stat-val">${pctOpsGlobal}%</div></div>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px">
        <div style="height:100%;width:${pctOpsGlobal}%;background:#00838f;border-radius:3px;transition:width 0.6s"></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="ch"><span class="ct">Ranking de operaciones</span></div>
    <div class="card-body" style="padding:0">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:left">#</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:left">Operacion</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:center">Usos</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:center">% completada</th>
        </tr></thead>
        <tbody>${filasRanking}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="ch"><span class="ct">Plantillas — uso real</span>
      <span style="font-size:10px;color:#7a9aa8;font-weight:400">Las sin uso pueden eliminarse</span>
    </div>
    <div class="card-body" style="padding:0">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:left">Plantilla</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:center">Usos</th>
          <th style="padding:6px 8px;font-size:10px;color:#7a9aa8;font-weight:600;text-align:center"></th>
        </tr></thead>
        <tbody>${filasPlantillas}</tbody>
      </table>
    </div>
  </div>`;

  document.getElementById('content').innerHTML = html;
}

function eliminarPlantilla(desc){
  if(!DB.config.plantillas) return;
  DB.config.plantillas = DB.config.plantillas.filter(p => p !== desc);
  save();
  renderReportes();
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
      <p class="text2" style="font-size:12px;margin-bottom:8px">Exportá o restaurá todos los datos de Mini HA.</p>
      <p id="mha-carpeta-status" style="font-size:11px;margin-bottom:12px;color:var(--text3)">Sin carpeta vinculada</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        <button class="btn btn-p" onclick="exportarBackup()">⬇️ Exportar JSON</button>
        <button class="btn" onclick="mhaSeleccionarCarpeta().then(()=>renderBackup())" style="background:#15803d;color:white;border-color:#15803d">📂 Carpeta</button>
        <button class="btn" onclick="mhaHacerSnapshot(true);renderBackup()" style="background:#0284c7;color:white;border-color:#0284c7">📸 Snapshot</button>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Snapshots automáticos <span class="text3" style="font-size:11px;font-weight:400">(últimos ${mhaCargarSnaps().length}/${MAX_SNAPS})</span></span></div>
    <div class="card-body">
      ${mhaCargarSnaps().length === 0
        ? '<p class="text3" style="font-size:12px">Sin snapshots todavía. Se crean automáticamente al cerrar o minimizar.</p>'
        : mhaCargarSnaps().map(s => {
            const d = new Date(s.ts);
            const label = d.toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit",year:"2-digit"}) + " " + d.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
              <span style="color:var(--text2)">${s.manual?"📌":"🔄"} ${label}</span>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-sm" onclick="mhaRestaurarSnapshot(${s.ts})">↩️ Restaurar</button>
                <button class="btn btn-sm btn-d" onclick="mhaEliminarSnapshot(${s.ts})">✕</button>
              </div>
            </div>`;
          }).join("")
      }
    </div>
  </div>
  <div class="card">
    <div class="ch"><span class="ct">Caché y Service Worker</span></div>
    <div class="card-body">
      <p class="text2" style="font-size:12px;margin-bottom:12px">Si la app no refleja los últimos cambios, limpiá el caché y recargá.</p>
      <button class="btn" style="background:#c8960a;color:#fff;border-color:#c8960a" onclick="limpiarCache()">🔄 Limpiar caché y recargar</button>
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
        <div style="margin-top:16px;font-family:'Dancing Script',cursive;font-size:22px;color:#93c5fd;">Development by Guille</div>
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
    setTimeout(() => { el.remove(); mostrarModalPendientes(); }, 400);
  }, 5000);
}

function mostrarModalPendientes(){
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const limite = new Date(hoy); limite.setDate(limite.getDate() + 7);

  const activos = ['En curso','Planificado'];
  const pendientes = (DB.proyectosHA||[]).filter(p => {
    if(!activos.includes(p.estado)) return false;
    if(!p.fechaEstFin) return false;
    const fin = new Date(p.fechaEstFin); fin.setHours(0,0,0,0);
    return fin <= limite;
  }).sort((a,b) => new Date(a.fechaEstFin) - new Date(b.fechaEstFin));

  if(!pendientes.length) return; // nada para informar

  const overlay = document.createElement('div');
  overlay.id = 'modal-pendientes';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9998;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px';

  const hoyStr = hoy.toISOString().slice(0,10);

  const filas = pendientes.length ? pendientes.map(p => {
    const fin = new Date(p.fechaEstFin); fin.setHours(0,0,0,0);
    const diff = Math.round((fin - hoy) / 86400000);
    const vencido = diff < 0;
    const hoy_ = diff === 0;
    const color = vencido ? '#c0392b' : (hoy_ ? '#c4955a' : '#c8d8e0');
    const label = vencido ? `Vencido hace ${Math.abs(diff)} dia${Math.abs(diff)!==1?'s':''}` : (hoy_ ? 'Vence hoy' : `Vence en ${diff} dia${diff!==1?'s':''}`);
    return `<div onclick="cerrarPendientes();abrirProyecto(${p.id})" style="cursor:pointer;padding:10px 12px;border-left:3px solid ${color};background:var(--surface2);border-radius:4px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div>
          <span style="font-size:10px;color:#c0392b;font-weight:700">${esc(p.numero)}</span>
          <span style="font-size:13px;color:var(--text1);font-weight:600;margin-left:8px">${esc(p.titulo)}</span>
        </div>
        <span style="font-size:11px;color:${color};white-space:nowrap;flex-shrink:0">${label}</span>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">${esc(p.estado)} · Est. fin: ${fmtFecha(p.fechaEstFin)}</div>
    </div>`;
  }).join('') : '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">Sin proyectos vencidos ni por vencer en los proximos 7 dias.</div>';

  overlay.innerHTML = `<div style="background:var(--surface);border-radius:var(--r);max-width:520px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;font-weight:700;color:var(--text1)">📅 Seguimiento de fechas</span>
      <span style="font-size:11px;color:var(--text3)">${fmtFecha(hoyStr)}</span>
    </div>
    <div style="padding:16px 20px">${filas}</div>
    <div style="padding:12px 20px;border-top:1px solid var(--border);text-align:right">
      <button class="btn btn-p" onclick="cerrarPendientes()">Entendido</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
}

function cerrarPendientes(){
  const el = document.getElementById('modal-pendientes');
  if(el) el.remove();
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  mostrarSplash();
  load();
  goTo('dashboard');
  mhaRestaurarCarpetaGuardada();
  const navVer = document.getElementById('nav-version');
  if(navVer) navVer.textContent = VERSION;

  // Safe-close: snapshot automático + backup carpeta
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'hidden'){
      mhaHacerSnapshot(false);
      if(_dirHandle) mhaGuardarEnCarpeta();
    }
  });
  window.addEventListener('beforeunload', ()=>{ mhaHacerSnapshot(false); });
});
