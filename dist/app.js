import './search-select.js';
import {zone,operator,warehouseName,partyName,directoryKinds,statuses,movements,cols,docFields,stockCols,today,stamp,round,numeric,nonNegative,isLow,isOut,stockStatus,records,stockAt,isTransfer,isRepacking,isProductionBatch,matchesMovement,canMoveBulk,canOpenStock,packageKg,repackWeight,calculate,varianceTone,saveStock,saveTransaction,saveDirectoryEntry,archiveDirectoryEntry,updateTransactionDetails,voidTransaction,audit,uid,setOperator,emptyStockState} from './model.js';
import {AccessError,account,restoreSession,signIn,signOut,accessRole,fetchStock,writeStock,depotAssignment,fetchDepotCatalog,fetchDepotOrders,submitDepotOrder} from './backend.js';
import {readTable,makeCsv,makeSheet,makePdf,download} from './files.js';

const icons={
  brand:'<path d="m12 2 8.5 4.8v10.4L12 22l-8.5-4.8V6.8L12 2Z"/><path d="m3.5 6.8 8.5 4.8 8.5-4.8m-8.5 4.8V22m4.25-12.8L7.75 4.4"/>',
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  box:'<path d="M4 7h16v13H4zM3 4h18v3H3zm6 8h6"/>',
  swap:'<path d="M3 7h17m-5-5 5 5-5 5m6 5H4m5-5-5 5 5 5"/>',
  contacts:'<path d="M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.9M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.7a4 4 0 0 1 0 7.4"/>',
  warehouse:'<path d="M3 21V8l9-5 9 5v13H3zm4 0V11h10v10M7 15h10M7 18h10"/>',
  report:'<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 17v-3m4 3v-6m4 6v-4"/>',
  flask:'<path d="M9 3h6m-5 0v6l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8"/>',
  'chevron-right':'<path d="m9 6 6 6-6 6"/>','chevron-left':'<path d="m15 6-6 6 6 6"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',plus:'<path d="M12 5v14M5 12h14"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  inbound:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  outbound:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  alert:'<path d="M10.3 4.5 3 17a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0ZM12 9v4m0 3h.01"/>',
  stop:'<circle cx="12" cy="12" r="9"/><path d="m6 18 12-12"/>',
  search:'<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  filters:'<path d="M4 6h16M7 12h10m-7 6h4"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/>',
  sort:'<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>',
  up:'<path d="m6 14 6-6 6 6"/>',down:'<path d="m6 10 6 6 6-6"/>',
  edit:'<path d="m13 6 5 5M4 20l1-5L16 4a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3L9 19l-5 1z"/>',
  history:'<path d="M3 12a9 9 0 1 0 2.2-5.9L3 9m0-5v5h5m4-2v5l3 2"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>',truck:'<path d="M2 6h12v11H2zM14 10h4l4 4v3h-8"/><circle cx="6" cy="18" r="2" fill="white"/><circle cx="18" cy="18" r="2" fill="white"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
  calendar:'<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 3v5m8-5v5M4 10h16"/>',
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.box}</svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=new Intl.NumberFormat('en-ZW',{minimumFractionDigits:2,maximumFractionDigits:3});
const count=new Intl.NumberFormat('en-ZW');
const fmt=value=>num.format(value);
const dayText=(date,options={day:'numeric',month:'short',year:'numeric'})=>date?new Intl.DateTimeFormat('en-GB',{...options,timeZone:zone}).format(new Date(date.length===10?date+'T12:00:00+02:00':date)):'—';
const timeText=date=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:zone}).format(new Date(date));
const dateTime=date=>date?`${dayText(date)} ${timeText(date)}`:'—';
const getDay=date=>date?new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format(new Date(date)):'';
const total=rows=>round(rows.reduce((sum,row)=>sum+row.balance,0));
const match=(value,query)=>String(value??'').toLowerCase().includes(String(query??'').trim().toLowerCase());
const unique=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
let role='';
let assignedDepot='', orders=[], catalog=[], depotOrderRequest='';
const canWrite=()=>role==='full_access';
const editorActions=new Set(['import','confirm-import','template','new-stock','edit-stock','archive-ask','directory-editor','directory-archive','new-tx','history-tx','variance-settings','tx-edit','tx-void','export-stock','export-tx','report-export']);
const allowedAction=action=>!editorActions.has(action)||canWrite();
const button=(label,name,action,{primary=false,data='',attrs=''}={})=>!allowedAction(action)?'':`<button type="button" class="btn${primary?' primary':''}" data-action="${action}" ${data} ${attrs}>${name?icon(name):''}${esc(label)}</button>`;
const iconButton=(label,name,action,data='')=>!allowedAction(action)?'':`<button type="button" class="icon-btn" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}" ${data}>${icon(name)}</button>`;
const link=(label,action,data='')=>`<button type="button" class="link" data-action="${action}" ${data}>${esc(label)}</button>`;
const pageHead=(title,description,actions='')=>`<div class="page-head"><div><h1>${title}</h1><p>${description}</p></div>${actions?`<div class="heading-tools">${actions}</div>`:''}</div>`;
const panelHead=(title,subtitle,action='')=>`<div class="panel-head"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${action}</div>`;
const badge=(label,tone=statuses[label])=>`<span class="badge tone-${typeof tone==='string'&&/^[a-z]+$/.test(tone)?tone:'grey'}">${esc(label)}</span>`;
const empty=(length,text)=>`<tr><td class="empty" colspan="${length}">${esc(text)}</td></tr>`;
const field=(label,control,hint='')=>`<label class="field">${esc(label)}${control}${hint?`<small>${esc(hint)}</small>`:''}</label>`;
const input=(name,value='',type='text',attributes='')=>`<input name="${name}" type="${type}" value="${esc(value)}" ${attributes}>`;
const textarea=(name,value='',attrs='')=>`<textarea name="${name}" ${attrs}>${esc(value)}</textarea>`;
const options=(choices,value)=>choices.map(option=>{
  const [key,label]=Array.isArray(option)?option:[option,option];
  return `<option value="${esc(key)}"${String(value)===String(key)?' selected':''}>${esc(label)}</option>`;
}).join('');
const select=(name,choices,value='',placeholder='',attrs='')=>`<select name="${name}" ${attrs}>${placeholder?options([['',placeholder]],value):''}${options(choices,value)}</select>`;
const sortedDirectory=(kind,includeArchived=false)=>db[kind+'s'].filter(entry=>includeArchived||!entry.archived).sort((a,b)=>a.name.localeCompare(b.name));
const directoryOptions=(kind,includeArchived=false)=>sortedDirectory(kind,includeArchived).map(({id,name,archived})=>[id,archived?name+' (archived)':name]);
const warehouseOptions=(includeArchived=false)=>directoryOptions('warehouse',includeArchived);
const safeId=(id,key='id')=>`data-${key}="${esc(id)}"`;
const pageList=[
  ['dashboard','Dashboard','dashboard'],['stock','Stock Management','box'],['transactions','Transactions','swap'],
  ['warehouses','Warehouses','warehouse'],['contacts','Contacts','contacts'],['reports','Reports','report'],
];
const orderPage=['depot-orders','Depot Orders','report'];
const visiblePages=()=>role==='depot_supervisor'?[orderPage]:canWrite()?[...pageList,orderPage]:pageList;
const movementTones={
  'Stock Received':['inbound','green'],'Dispatch':['outbound','blue'],'Production':['layers','purple'],
  'Transfer Out':['swap','teal'],'Transfer In':['swap','teal'],'Repacking Out':['box','purple'],'Repacking In':['box','purple'],'Return':['inbound','green'],
  'Stock Adjustment':['edit','amber'],'Damaged Stock':['alert','red'],'Stock Count Correction':['edit','amber'],
};
const movementTone=type=>Object.hasOwn(movementTones,type)?movementTones[type]:['box','grey'];
const reportTypes=['Daily Stock Report','Current Stock Report','Warehouse Stock Report','Product Stock Report','Daily Dispatch Report','Daily Receipt Report','Stock Movement Report','Transaction Report','Low Stock Report','Out-of-Stock Report','Variance Report','Transporter Report','Client Dispatch Report','Stock Adjustment Report'];
const initialFilters=()=>({search:'',warehouse:'',product:'',pack:'',status:'',min:'',max:'',updated:'',sort:'code',dir:1,expanded:false});
const view={stock:initialFilters(),transactions:{search:'',type:'',warehouse:'',page:1,size:25},reports:{type:'Current Stock Report',start:'',end:'',warehouse:'',product:'',code:'',transporter:'',client:'',movement:'',status:'',page:1,size:25}};
const main=document.getElementById('main');
const nav=document.getElementById('nav');
const dialog=document.getElementById('dialog');
let db=emptyStockState();
let connected=false, synchronizing=false, workspaceGeneration=0;
let route='dashboard', activeWarehouse='';
let toastTimeout, searchTimeout, openEditor;
let transactionHistory;
let stableView='';
document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
document.getElementById('top-date').innerHTML=icon('calendar')+' '+esc(dayText(today(),{weekday:'short',day:'numeric',month:'short',year:'numeric'}));

function connection() {
  const element=document.getElementById('connection');
  const online=navigator.onLine;
  element.classList.toggle('off',!connected||!online);
  element.innerHTML='<span></span> '+(!online?'Offline':connected?'Connected':'Reconnecting');
  element.title='Stock changes sync through Supabase.';
}
function toast(message) {
  const el=document.getElementById('toast');
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>el.classList.remove('show'),4200);
}

function setMenu(open) {
  document.getElementById('sidebar').classList.toggle('open',open);
  document.getElementById('side-shade').hidden=!open;
  document.getElementById('menu-toggle').setAttribute('aria-expanded',String(open));
}
document.getElementById('menu-toggle').addEventListener('click',()=>setMenu(!document.getElementById('sidebar').classList.contains('open')));
document.getElementById('side-shade').addEventListener('click',()=>setMenu(false));
window.addEventListener('online',()=>{connection();void synchronize();});
window.addEventListener('offline',connection);

function dashboard() {
  const active=records(db), day=today(), todays=db.transactions.filter(tx=>tx.date===day&&tx.status==='Completed');
  const low=new Set(active.filter(isLow).map(row=>row.code)).size, out=new Set(active.filter(isOut).map(row=>row.code)).size;
  const metrics=[
    ['Total stock',fmt(total(active)),'MT','Across all warehouses','layers','blue','stock'],
    ['Products',count.format(new Set(active.map(row=>row.code)).size),'','Active material codes','box','purple','stock'],
    ['Warehouses',sortedDirectory('warehouse').length,'','Operational locations','warehouse','teal','warehouses'],
    ['Stock received today',fmt(todays.filter(tx=>tx.type==='Stock Received').reduce((sum,tx)=>sum+tx.delta,0)),'MT','Goods received','inbound','green','receipt'],
    ['Stock dispatched today',fmt(todays.filter(tx=>matchesMovement(tx.type,'Dispatch')).reduce((sum,tx)=>sum+tx.out,0)),'MT','Customer dispatches','outbound','blue','dispatch'],
    ['Transactions today',todays.length,'','Completed movements','swap','purple','transactions'],
    ['Low stock alerts',low,'','Products to replenish','alert','amber','low'],
    ['Out of stock',out,'','Products with no balance','stop','red','out'],
  ];
  const cards=metrics.map(([label,value,unit,help,glyph,tone,target])=>`<button type="button" class="metric metric-button" data-key="${target}-${glyph}" data-action="metric" data-id="${target}"><span class="metric-top"><span>${label}</span><span class="metric-icon tone-${tone}">${icon(glyph)}</span></span><strong>${value}${unit?`<small>${unit}</small>`:''}</strong><span class="metric-foot">${help}</span></button>`).join('');
  const latest=db.audit.filter(row=>row.kind==='Stock').slice(0,5);
  const activities=latest.map(row=>{
    const [glyph,tone]=movementTone(row.action);
    const delta=Number(row.delta||0);
    return `<tr ${safeId(row.id,'key')}><td><strong>${esc(dayText(row.at,{day:'numeric',month:'short'}))}</strong><span class="sub">${timeText(row.at)}</span></td><td><div class="activity-name"><span class="activity-icon tone-${tone}">${icon(glyph)}</span><span><strong>${esc(row.action)}</strong><span class="sub">${esc(row.reason||row.movement||'Warehouse balance changed')}</span></span></div></td><td><strong>${esc(row.product)}</strong><span class="sub">${esc(warehouseName(db,row.warehouse))}</span></td><td class="t-number ${delta>0?'positive':delta<0?'negative':''}"><strong>${delta>0?'+':delta<0?'−':''}${fmt(Math.abs(delta))} MT</strong></td><td>${esc(row.user)}</td></tr>`;
  }).join('');
  const byWarehouse=sortedDirectory('warehouse').map(wh=>({...wh,balance:total(active.filter(row=>row.warehouse===wh.id))})).sort((a,b)=>b.balance-a.balance);
  const max=Math.max(...byWarehouse.map(wh=>wh.balance),1);
  const bars=byWarehouse.map(wh=>`<button type="button" class="warehouse-bar" data-action="warehouse-stock" ${safeId(wh.id)} ${safeId(wh.id,'key')}><span class="bar-label"><strong>${esc(wh.name)}</strong><span>${fmt(wh.balance)} MT</span></span><span class="bar-track" style="display:block"><span class="bar-fill" style="width:${Math.max(0,wh.balance/max*100)}%;--fill:${/^#[0-9a-f]{6}$/i.test(wh.color)?wh.color:'#2c63ed'}"></span></span></button>`).join('');
  return pageHead('Dashboard','Track fertilizer stock, warehouse balances and daily movements.',button('Import Stock','upload','import')+button('New Transaction','plus','new-tx',{primary:true}))+ 
  `<div class="section-label"><h2>Inventory overview</h2><span>All warehouses · Metric tonnes</span></div><section class="metrics" id="metrics">${cards}</section>
  <div class="dash-lower"><section class="panel">${panelHead('Recent activity','Latest stock movements and adjustments',link('View transactions','go','data-id="transactions"'))}
  <div class="table-wrap activity-table" tabindex="0" aria-label="Recent activity"><table><thead><tr><th>Date / time</th><th>Movement</th><th>Product / Warehouse</th><th class="t-number">Quantity</th><th>Updated by</th></tr></thead><tbody id="activity-rows">${activities||empty(5,'No activity yet.')}</tbody></table></div></section>
  <section class="panel">${panelHead('Stock by warehouse','Current balances across all locations',link('View warehouses','go','data-id="warehouses"'))}<div class="warehouse-bars" id="warehouse-bars">${bars||'<p class="sub">No warehouses yet.</p>'}</div><div class="warehouse-bottom" id="warehouse-total"><span>Total warehouse stock</span><strong>${fmt(total(active))} MT</strong></div></section></div>`;
}

function stockRows(state=view.stock) {
  const rows=records(db).filter(row=>
    (!state.search||[row.code,row.sap,row.product,row.pack,warehouseName(db,row.warehouse),stockStatus(row),row.comment].some(value=>match(value,state.search))) &&
    (!state.warehouse||row.warehouse===state.warehouse) && (!state.product||row.product===state.product) &&
    (!state.pack||row.pack===state.pack) && (!state.status||stockStatus(row)===state.status) &&
    (state.min===''||row.balance>=Number(state.min)) && (state.max===''||row.balance<=Number(state.max)) &&
    (!state.updated||getDay(row.updatedAt)===state.updated));
  const value=row=>state.sort==='warehouse'?warehouseName(db,row.warehouse):row[state.sort];
  return rows.sort((a,b)=>{
    const left=value(a),right=value(b);
    const order=state.sort==='updatedAt'?Date.parse(left)-Date.parse(right):typeof left==='number'?left-right:String(left).localeCompare(String(right),undefined,{numeric:true});
    return order*state.dir || a.code.localeCompare(b.code);
  });
}
function pager(scope,state,length) {
  const max=Math.max(1,Math.ceil(length/state.size));
  state.page=Math.min(state.page,max);
  return `<div class="table-foot" data-key="pager"><span>${length?`Showing ${count.format((state.page-1)*state.size+1)}–${count.format(Math.min(state.page*state.size,length))} of ${count.format(length)} records`:'0 records'}</span><div class="toolbar"><label>Rows per page ${select('size',[25,50,100],state.size,'',`data-filter="${scope}" aria-label="Rows per page"`)}</label><span>Page ${state.page} of ${max}</span><button type="button" class="icon-btn" aria-label="Previous page" data-action="paginate" data-id="${scope}" data-direction="-1" ${state.page===1?'disabled':''}>${icon('chevron-left')}</button><button type="button" class="icon-btn" aria-label="Next page" data-action="paginate" data-id="${scope}" data-direction="1" ${state.page===max?'disabled':''}>${icon('chevron-right')}</button></div></div>`;
}
const slice=(rows,state)=>rows.slice((state.page-1)*state.size,state.page*state.size);
const filterSelect=(scope,label,name,choices,value,placeholder='All')=>field(label,select(name,choices,value,placeholder,`data-filter="${scope}"`));
const filterInput=(scope,label,name,value,type='text',attrs='')=>field(label,input(name,value,type,`data-filter="${scope}" ${attrs}`));
const searchBox=(scope,placeholder,value)=>`<label class="search"><span>${icon('search')}</span>${input('search',value,'search',`data-filter="${scope}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"`)}</label>`;
function stockBody() {
  const state=view.stock, list=stockRows(state);
  const sortable=new Set(['code','sap','product','warehouse','balance','updatedAt']);
  const labels=[...stockCols.filter(([key])=>key!=='comment'),['actions','Actions']];
  const heading=labels.map(([key,label])=>`<th ${key==='balance'?'class="t-number"':''} ${state.sort===key?`aria-sort="${state.dir===1?'ascending':'descending'}"`:''}>${sortable.has(key)?`<button type="button" class="sort" data-action="sort" ${safeId(key)}>${esc(label)} ${icon(state.sort===key?(state.dir===1?'up':'down'):'sort')}</button>`:esc(key==='status'?'Status / Comments':label)}</th>`).join('');
  const rows=list.map(row=>{
    const historyData=`${safeId(row.code)} ${safeId(row.warehouse,'warehouse')}`;
    return `<tr ${safeId(row.id,'key')}><td>${link(row.code,'history',historyData)}</td><td>${esc(row.sap)}</td><td>${link(row.product,'history',historyData)}</td><td>${esc(row.pack)}</td><td>${esc(warehouseName(db,row.warehouse))}</td><td class="t-number"><strong>${fmt(row.balance)}</strong></td><td>${badge(stockStatus(row))}${row.comment?`<span class="sub">${esc(row.comment)}</span>`:''}</td><td>${dateTime(row.updatedAt)}</td><td>${esc(row.updatedBy)}</td><td><div class="row-actions">${iconButton('Edit stock item','edit','edit-stock',safeId(row.id))}${iconButton('View stock history','history','history',historyData)}</div></td></tr>`;
  }).join('');
  return `<div class="table-wrap" tabindex="0" aria-label="Stock records"><table class="stock-table"><thead><tr>${heading}</tr></thead><tbody>${rows||empty(10,'No stock records match your filters.')}</tbody></table></div><div class="table-foot" data-key="stock-count">${count.format(list.length)} ${list.length===1?'record':'records'}</div>`;
}
function stockPage() {
  const state=view.stock, active=records(db);
  const tools=button('Import Daily Stock','upload','import')+button('Add Stock Item','plus','new-stock',{primary:true});
  const filters=[
    filterSelect('stock','Warehouse','warehouse',warehouseOptions(),state.warehouse),filterSelect('stock','Product','product',unique(active.map(row=>row.product)),state.product),
    filterSelect('stock','Packaging','pack',unique(active.map(row=>row.pack)),state.pack),filterSelect('stock','Stock status','status',Object.keys(statuses),state.status),
    filterInput('stock','Minimum balance (MT)','min',state.min,'number','step="0.001" min="0"'),filterInput('stock','Maximum balance (MT)','max',state.max,'number','step="0.001" min="0"'),
    filterInput('stock','Last updated date','updated',state.updated,'date'),`<div class="field" style="align-self:end">${button('Clear filters','x','clear-stock')}</div>`,
  ].join('');
  return pageHead('Stock Management','Search, update and audit stock by material and warehouse.',tools)+
    `<section class="panel"><div class="search-toolbar">${searchBox('stock','Search stock records…',state.search)}<div class="toolbar">${button('Filters','filters','toggle-stock',{attrs:`aria-expanded="${state.expanded}" aria-controls="stock-filters"`})}${button('Export Filtered Stock','download','export-stock')}${button('Archived Stock','history','archived')+button('Import History','history','import-history')}</div></div><div id="stock-filters" class="filters" ${state.expanded?'':'hidden'}>${filters}</div><div id="stock-body">${stockBody()}</div></section>`;
}

function txRows() {
  const state=view.transactions;
  return db.transactions.filter(row=>(!state.warehouse||row.warehouse===state.warehouse)&&matchesMovement(row.type,state.type)&&(!state.search||[row.id,row.code,row.product,row.pack,row.truck,partyName(db,'transporter',row),partyName(db,'client',row),row.invoice,row.notes].some(value=>match(value,state.search))));
}
const decimalCols=new Set(['delta','weightKg','produced','productionLoss','weigh','expected','variance','accounting','out','balance']);
function displayValue(key,row) {
  const value=row[key];
  if(key==='transporter'||key==='client') return partyName(db,key,row);
  if(key==='warehouse') return warehouseName(db,value);
  if(key==='loadType') return value==='bulk'?'Bulk (loose)':value==='bags'?'Bagged':null;
  if(key==='date') return dayText(value);
  if(key.endsWith('At')) return dateTime(value);
  return value;
}
function cellText(key,row) {
  const value=displayValue(key,row);
  if(value===undefined||value===null||value==='') return '—';
  if(decimalCols.has(key)) return fmt(value);
  return esc(value);
}
function txBody() {
  const state=view.transactions, all=txRows(), foot=pager('transactions',state,all.length);
  const rows=slice(all,state).map(tx=>`<tr ${safeId(tx.id,'key')}>${cols.map(([key])=>`<td class="${decimalCols.has(key)||key==='bags'?'t-number':''}">${key==='date'?link(dayText(tx.date),'tx-detail',safeId(tx.id)):key==='status'?badge(tx.status,tx.status==='Voided'?'grey':'green'):key==='variance'&&tx.variance!==null?badge(fmt(tx.variance),varianceTone(db,tx.variance)):cellText(key,tx)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap" tabindex="0" aria-label="Transaction register"><table class="transactions-table"><thead><tr>${cols.map(([key,label])=>`<th class="${decimalCols.has(key)||key==='bags'?'t-number':''}">${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows||empty(cols.length,'No transactions match your filters.')}</tbody></table></div>${foot}`;
}
function transactionsPage() {
  const state=view.transactions;
  return pageHead('Transactions','Record receipts, dispatches, transfers and other stock movements.',button('Variance Settings','settings','variance-settings')+button('New Transaction','plus','new-tx',{primary:true}))+
  `<section class="panel"><div class="search-toolbar">${searchBox('transactions','Search transactions…',state.search)}<div class="toolbar">${button('Export CSV','download','export-tx')}</div></div><div class="filters">${filterSelect('transactions','Warehouse','warehouse',warehouseOptions(true),state.warehouse)}${filterSelect('transactions','Movement type','type',movements,state.type)}</div><div id="transactions-body">${txBody()}</div></section>`;
}

function warehouseCards() {
  return sortedDirectory('warehouse').map(wh=>{
    const list=records(db).filter(row=>row.warehouse===wh.id);
    const last=list.reduce((at,row)=>Date.parse(row.updatedAt)>(Date.parse(at)||0)?row.updatedAt:at,wh.updatedAt);
    return `<article class="warehouse-card" ${safeId(wh.id,'key')}><span class="metric-icon tone-blue">${icon('warehouse')}</span><h2>${link(wh.name,'warehouse-stock',safeId(wh.id))}</h2>${wh.place?`<span class="sub">${esc(wh.place)}</span>`:''}<div class="warehouse-total">${fmt(total(list))} <small>MT on hand</small></div><div class="wh-meta"><div><b>${list.length}</b><span>Products</span></div><div><b>${list.filter(isLow).length}</b><span>Low stock</span></div><div><b>${list.filter(isOut).length}</b><span>Out of stock</span></div></div><p class="sub">Last update · ${dateTime(last)}</p><div class="toolbar warehouse-actions">${button('View Stock','box','warehouse-stock',{data:safeId(wh.id),primary:true})}${button('Warehouse Details',null,'warehouse-detail',{data:safeId(wh.id)})}${directoryButton('warehouse',wh.id)}</div></article>`;
  }).join('');
}
function warehouseDetail(id) {
  const wh=db.warehouses.find(item=>item.id===id);
  const stock=records(db).filter(row=>row.warehouse===id);
  const tx=db.transactions.filter(row=>row.warehouse===id);
  const groups=[['Recent receipts',['Stock Received','Return','Production']],['Recent dispatches',['Dispatch','Production Direct']],['Production batches',['Production Input','Production Output','Production Direct']],['Transfers in',['Transfer In']],['Transfers out',['Transfer Out']],['Repacking',['Repacking Out','Repacking In']],['Stock adjustments',['Stock Adjustment','Stock Count Correction','Damaged Stock']]];
  const groupHtml=groups.map(([label,types])=>{
    const rows=tx.filter(row=>row.status==='Completed'&&types.includes(row.type)).slice(0,10);
    return `<section class="panel detail-panel"><h3>${label}</h3>${rows.length?rows.map(row=>`<div class="detail-row" ${safeId(row.id,'key')}><span>${link(row.id,'tx-detail',safeId(row.id))}<span class="sub">${esc(row.product)}</span></span><strong>${row.delta>0?'+':''}${fmt(row.delta)} MT</strong><span>${dayText(row.date)}</span></div>`).join(''):'<p class="sub">No matching movements.</p>'}</section>`;
  }).join('');
  return `<div id="warehouse-detail-heading">${pageHead(esc(wh.name),esc(wh.place),button('All Warehouses','chevron-left','go',{data:'data-id="warehouses"'})+directoryButton('warehouse',id)+button('View Stock','box','warehouse-stock',{data:safeId(id),primary:true}))}</div>`+
  `<div id="warehouse-detail-data"><section class="panel report-panel">${panelHead('Current products',`${stock.length} records · ${fmt(total(stock))} MT on hand`)}<div class="table-wrap" tabindex="0" aria-label="Warehouse stock"><table class="report-table"><thead><tr><th>Material code</th><th>Product</th><th>Packaging</th><th>Balance</th><th>Status</th></tr></thead><tbody>${stock.map(row=>`<tr ${safeId(row.id,'key')}><td>${link(row.code,'history',safeId(row.code))}</td><td>${esc(row.product)}</td><td>${esc(row.pack)}</td><td>${fmt(row.balance)} MT</td><td>${badge(stockStatus(row))}</td></tr>`).join('')||empty(5,'No current products.')}</tbody></table></div></section><div class="warehouse-grid">${groupHtml}</div></div>`;
}
function warehousesPage() {
  return activeWarehouse?warehouseDetail(activeWarehouse):pageHead('Warehouses','Manage locations and review their stock and movements.',directoryButton('warehouse'))+`<div class="warehouse-grid" id="warehouse-cards">${warehouseCards()||'<section class="panel detail-panel">No warehouses yet.</section>'}</div>`;
}
function directoryButton(kind,id) {
  const data=safeId(kind,'kind')+(id?' '+safeId(id):'');
  return button(`${id?'Edit':'Add'} ${directoryKinds[kind]}`,id?'edit':'plus','directory-editor',{data,primary:!id});
}
function contactsPage() {
  const panels=['transporter','client'].map(kind=>{
    const label=directoryKinds[kind];
    const rows=sortedDirectory(kind).map(entry=>`<tr ${safeId(entry.id,'key')}><td><strong>${esc(entry.name)}</strong></td><td class="contact-action">${directoryButton(kind,entry.id)}</td></tr>`).join('');
    return `<section class="panel" data-key="${kind}">${panelHead(label+'s','',directoryButton(kind))}<table class="contacts-table"><thead><tr><th scope="col">Name</th><th scope="col" class="contact-action">Action</th></tr></thead><tbody>${rows||empty(2,`No ${kind}s have been added.`)}</tbody></table></section>`;
  }).join('');
  return pageHead('Contacts','Manage the transporters and clients available on transactions.')+`<div class="warehouse-grid contacts-grid" id="contact-directories">${panels}</div>`;
}

const stockReports=new Set(['Daily Stock Report','Current Stock Report','Warehouse Stock Report','Product Stock Report','Low Stock Report','Out-of-Stock Report']);
function reportData() {
  const s=view.reports;
  const range=day=>(!s.start||day>=s.start)&&(!s.end||day<=s.end);
  const base=(row,status)=>(!s.warehouse||row.warehouse===s.warehouse)&&(!s.product||row.product===s.product)&&(!s.code||match(row.code,s.code))&&(!s.status||status===s.status);
  if(s.start&&s.end&&s.start>s.end) return {columns:stockReports.has(s.type)?stockCols:cols,rows:[],warning:'Start date must be on or before the end date.'};
  if(stockReports.has(s.type)) {
    let inventory=records(db);
    if(s.type==='Daily Stock Report') {
      const snapshots=new Map();
      const end=s.end||s.start||today();
      for(const entry of db.audit) {
        if(entry.kind==='Stock'&&getDay(entry.at)<=end&&!snapshots.has(entry.recordId)) snapshots.set(entry.recordId,entry.after);
      }
      inventory=[...snapshots.values()].filter(row=>row&&!row.archived).map(row=>({...row,asOf:end}));
    }
    const linked=new Set(db.transactions.filter(tx=>range(tx.date)&&(!s.transporter||tx.transporterId===s.transporter)&&(!s.client||tx.clientId===s.client)&&matchesMovement(tx.type,s.movement)&&tx.status==='Completed').map(tx=>tx.code+'|'+tx.warehouse));
    const rows=inventory.filter(row=>base(row,stockStatus(row))&&
      (s.type==='Daily Stock Report'||range(getDay(row.updatedAt)))&&
      ((!s.transporter&&!s.client&&!s.movement)||linked.has(row.code+'|'+row.warehouse))&&
      (s.type!=='Low Stock Report'||isLow(row))&&(s.type!=='Out-of-Stock Report'||isOut(row)));
    rows.sort((a,b)=>s.type==='Warehouse Stock Report'?warehouseName(db,a.warehouse).localeCompare(warehouseName(db,b.warehouse))||a.code.localeCompare(b.code):s.type==='Product Stock Report'?a.product.localeCompare(b.product)||warehouseName(db,a.warehouse).localeCompare(warehouseName(db,b.warehouse)):a.code.localeCompare(b.code));
    return {columns:s.type==='Daily Stock Report'?[['asOf','Closing Date'],...stockCols]:stockCols,rows:rows.map(row=>({...row,status:stockStatus(row)})),stock:true};
  }
  const daily=s.type==='Daily Dispatch Report'||s.type==='Daily Receipt Report';
  const movementForReport={
    'Daily Dispatch Report':['Dispatch','Production Direct'],'Daily Receipt Report':['Stock Received'],'Client Dispatch Report':['Dispatch','Production Direct'],
    'Stock Adjustment Report':['Stock Adjustment','Stock Count Correction'],
  }[s.type];
  const rows=db.transactions.filter(tx=>(s.status||s.type==='Transaction Report'||tx.status==='Completed')&&base(tx,tx.status)&&range(tx.date)&&(!daily||s.start||s.end||tx.date===today())&&
    (!s.transporter||tx.transporterId===s.transporter)&&(!s.client||tx.clientId===s.client)&&matchesMovement(tx.type,s.movement)&&
    (!movementForReport||movementForReport.includes(tx.type))&&
    (s.type!=='Variance Report'||tx.variance!==null)&&(s.type!=='Transporter Report'||tx.transporterId)&&(s.type!=='Client Dispatch Report'||tx.clientId));
  const selection={
    'Daily Dispatch Report':['date','id','code','product','warehouse','truck','transporter','client','out','invoice','status'],
    'Daily Receipt Report':['date','id','code','product','warehouse','truck','transporter','loadType','pack','bags','accounting','grv','balance'],
    'Stock Movement Report':['date','id','type','code','product','warehouse','pack','bags','weightKg','delta','accounting','out','produced','productionLoss','balance','createdBy','notes'],
    'Variance Report':['date','id','warehouse','truck','transporter','product','bags','expected','weigh','variance'],
    'Transporter Report':['date','id','transporter','truck','trailer1','trailer2','type','product','warehouse','accounting'],
    'Client Dispatch Report':['date','id','client','code','product','warehouse','transporter','out','invoice','delNote'],
    'Stock Adjustment Report':['date','id','type','code','product','warehouse','delta','balance','createdBy','notes'],
  }[s.type];
  const lookup=Object.fromEntries([...cols,['delta','Change (MT)']]);
  return {columns:selection?selection.map(key=>[key,lookup[key]]):cols,rows,stock:false};
}
function reportBody() {
  const s=view.reports,{columns,rows,stock,warning}=reportData();
  const foot=pager('reports',s,rows.length), items=slice(rows,s);
  const numericKey=new Set([...decimalCols,'delta','bags']);
  return `${warning?`<div class="flash warn">${esc(warning)}</div>`:''}<div class="table-wrap" tabindex="0" aria-label="Filtered report results"><table class="${columns.length>20?'transactions-table':'report-table'}"><thead><tr>${columns.map(([key,label])=>`<th class="${numericKey.has(key)?'t-number':''}">${esc(label)}</th>`).join('')}</tr></thead><tbody>${items.map(row=>`<tr ${safeId(row.id,'key')}>${columns.map(([key])=>`<td class="${numericKey.has(key)?'t-number':''}">${key==='status'?badge(row.status,stock?statuses[row.status]:row.status==='Voided'?'grey':'green'):key==='variance'&&row.variance!==null?badge(fmt(row.variance),varianceTone(db,row.variance)):key==='asOf'?dayText(row.asOf):cellText(key,row)}</td>`).join('')}</tr>`).join('')||empty(columns.length,'No records match this report and its filters.')}</tbody></table></div>${foot}`;
}
function reportsPage() {
  const s=view.reports, products=unique([...db.stock,...db.transactions].map(row=>row.product));
  const filters=[
    filterInput('reports','Start date','start',s.start,'date'),filterInput('reports','End date','end',s.end,'date'),
    filterSelect('reports','Warehouse','warehouse',warehouseOptions(true),s.warehouse),filterSelect('reports','Product','product',products,s.product),
    filterInput('reports','Material code','code',s.code,'search','placeholder="Any material code"'),filterSelect('reports','Transporter','transporter',directoryOptions('transporter',true),s.transporter),
    filterSelect('reports','Client','client',directoryOptions('client',true),s.client),filterSelect('reports','Movement type','movement',movements,s.movement),
    filterSelect('reports','Status','status',stockReports.has(s.type)?Object.keys(statuses):['Completed','Voided'],s.status),
  ].join('');
  return pageHead('Reports','Choose a report, apply filters and export the matching records.')+`
  <section class="panel report-panel"><div class="report-tools"><div class="toolbar"><h2>Report</h2>${select('type',reportTypes,s.type,'','data-filter="reports" aria-label="Report type"')}</div><div class="toolbar">${button('Excel','download','report-export',{data:'data-id="xlsx"'})}${button('CSV','download','report-export',{data:'data-id="csv"'})}${button('PDF','download','report-export',{data:'data-id="pdf"'})}</div></div>
  <div class="filters">${filters}<div class="field" style="align-self:end">${button('Clear filters','x','clear-report')}</div></div></section>
  <section class="panel">${panelHead('Report results',s.type==='Daily Stock Report'?'Closing balances for the selected date.':'Results reflect the current filters.')}<div id="reports-body">${reportBody()}</div></section>`;
}
function exportData(title,columns,rows,format) {
  if(!rows.length) { toast('No matching records to export.'); return; }
  const data=[columns.map(([,label])=>label),...rows.map(row=>columns.map(([key])=>displayValue(key,row)??''))];
  const file=format==='xlsx'?makeSheet(data):format==='pdf'?makePdf(title,data):makeCsv(data);
  download(file,`${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${today()}.${format}`);
  toast(`Exported ${rows.length} ${rows.length===1?'record':'records'}.`);
}

const routeBody={dashboard,stock:stockPage,transactions:transactionsPage,warehouses:warehousesPage,contacts:contactsPage,reports:reportsPage,'depot-orders':depotOrdersPage};
function readRoute() {
  const [name,param]=location.hash.slice(1).split('/');
  route=visiblePages().some(([id])=>id===name)?name:visiblePages()[0][0];
  activeWarehouse=route==='warehouses'&&db.warehouses.some(wh=>wh.id===param)?param:'';
}
function go(page,param='') {
  const hash='#'+page+(param?'/'+param:'');
  if(location.hash===hash) render(true);
  else location.hash=hash;
}
function render(force=false) {
  if(!role) return;
  readRoute();
  const key=route+'/'+activeWarehouse;
  if(force||stableView!==key) {
    stableView=key;
    nav.innerHTML=visiblePages().map(([id,label,glyph])=>`<a href="#${id}" class="nav-link${route===id?' active':''}" ${route===id?'aria-current="page"':''}>${icon(glyph)}${label}<span class="nav-arrow">${icon('chevron-right')}</span></a>`).join('');
    document.getElementById('crumb-page').textContent=visiblePages().find(([id])=>id===route)[1];
    main.innerHTML=routeBody[route]();
    return;
  }
  refreshParts();
}
function patch(target,source) {
  if(target.isEqualNode(source)) return;
  if(target.nodeType!==source.nodeType || target.nodeName!==source.nodeName) { target.replaceWith(source.cloneNode(true)); return; }
  if(target.nodeType===Node.TEXT_NODE) { target.nodeValue=source.nodeValue; return; }
  if(target.nodeType!==Node.ELEMENT_NODE) return;
  for(const attr of [...target.attributes]) if(!source.hasAttribute(attr.name)) target.removeAttribute(attr.name);
  for(const attr of [...source.attributes]) if(target.getAttribute(attr.name)!==attr.value) target.setAttribute(attr.name,attr.value);
  const keyed=new Map([...target.children].filter(child=>child.dataset.key).map(child=>[child.dataset.key,child]));
  let next=target.firstChild;
  for(const child of source.childNodes) {
    const key=child.nodeType===Node.ELEMENT_NODE?child.dataset.key:'';
    let current=key?keyed.get(key):next;
    if(key&&!current) {
      target.insertBefore(child.cloneNode(true),next);
      continue;
    }
    if(current&&current!==next) target.insertBefore(current,next);
    if(!current) {target.append(child.cloneNode(true));continue;}
    next=current.nextSibling;
    patch(current,child);
  }
  while(next) {const after=next.nextSibling;next.remove();next=after;}
}
function fragment(source) {
  const t=document.createElement('template');
  t.innerHTML=source;
  return t.content;
}
function refreshOptions(scope,name,choices,value) {
  const el=main.querySelector(`select[data-filter="${scope}"][name="${name}"]`);
  syncOptions(el,choices,value,'All');
}
function syncOptions(el,choices,value,placeholder) {
  const html=options([['',placeholder],...choices],value);
  if(el && el.innerHTML!==html) {
    el.innerHTML=html;
    el.value=value;
  }
}
function refreshParts() {
  if(!role) return;
  if(route==='depot-orders') return;
  if(route==='stock'||route==='transactions'||route==='reports') {
    const id=route+'-body';
    const next=fragment(`<div id="${id}">${{stock:stockBody,transactions:txBody,reports:reportBody}[route]()}</div>`).firstElementChild;
    patch(document.getElementById(id),next);
    refreshOptions(route,'warehouse',warehouseOptions(route!=='stock'),view[route].warehouse);
    if(route==='stock') {
      const active=records(db);
      refreshOptions('stock','product',unique(active.map(row=>row.product)),view.stock.product);
      refreshOptions('stock','pack',unique(active.map(row=>row.pack)),view.stock.pack);
    }
    if(route==='reports') {
      refreshOptions('reports','product',unique([...db.stock,...db.transactions].map(row=>row.product)),view.reports.product);
      for(const kind of ['transporter','client']) refreshOptions('reports',kind,directoryOptions(kind,true),view.reports[kind]);
    }
    return;
  }
  const next=fragment(routeBody[route]());
  const liveIds={dashboard:['metrics','activity-rows','warehouse-bars','warehouse-total'],contacts:['contact-directories'],warehouses:activeWarehouse?['warehouse-detail-heading','warehouse-detail-data']:['warehouse-cards']}[route];
  for(const id of liveIds) patch(document.getElementById(id),next.querySelector('#'+id));
}
window.addEventListener('hashchange',()=>{setMenu(false);render();window.scrollTo(0,0);});
nav.addEventListener('click',()=>setMenu(false));

function setFilter(event) {
  const {target}=event;
  const scope=target.dataset.filter;
  if(!scope) return;
  const state=view[scope], name=target.name, value=name==='size'?Number(target.value):target.value;
  if(state[name]===value) return;
  state[name]=value;
  if('page' in state) state.page=1;
  clearTimeout(searchTimeout);
  if(name==='type'&&scope==='reports'){state.status='';render(true);}
  else if(target.type==='search') searchTimeout=setTimeout(refreshParts,130);
  else refreshParts();
}
main.addEventListener('input',event=>{if(event.target.type==='search')setFilter(event);});
main.addEventListener('change',setFilter);
function displayStockUpdate(latest) {
  if(!role||Number(latest.revision)<=Number(db.revision)) return;
  db=latest;
  refreshParts();
  if(openEditor) {
    const current=db.stock.find(row=>row.id===openEditor.id);
    if(current?.rev!==openEditor.rev) formStatus('This stock item changed in another session. Close and reopen it to review the latest values before editing.','warn');
  }
  const stockWarehouse=dialog.querySelector('#stock-form select[name="warehouse"]');
  if(stockWarehouse) syncOptions(stockWarehouse,warehouseOptions(),stockWarehouse.value,'Select warehouse');
  const txForm=dialog.querySelector('#tx-form');
  if(txForm) {
    for(const kind of ['transporter','client']) {
      const field=txForm.elements[kind+'Id'];
      syncOptions(field,directoryOptions(kind),field.value,`Select ${kind}`);
    }
    updateTransactionForm('type');
  }
}

function openModal(title,description,body,actions='',wide=false) {
  openEditor=null;
  transactionHistory=null;
  dialog.classList.toggle('wide',wide);
  dialog.innerHTML=`<header class="modal-head"><div><h2 id="dialog-title">${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}</div>${iconButton('Close','x','close')}</header><div class="modal-content">${body}</div>${actions?`<footer class="modal-actions">${actions}</footer>`:''}`;
  if(!dialog.open) dialog.showModal();
  else dialog.scrollTop=0;
}
const modalButtons=(label,form)=>button('Cancel',null,'close')+`<button type="submit" form="${form}" class="btn primary">${esc(label)}</button>`;
const statusBox='<div class="flash full" id="form-status" role="status" hidden></div>';
function formStatus(message,tone='error') {
  const el=dialog.querySelector('#form-status');
  if(!el) return;
  el.hidden=!message;
  el.className='flash full '+tone;
  el.textContent=message;
}
function closeDialog(confirmation='') {
  if(transactionHistory) {
    const {code,warehouse}=transactionHistory;
    history(code,warehouse,confirmation);
    dialog.querySelector('[data-action="history-tx"], .modal-actions [data-action="close"]').focus();
  } else if(dialog.open) dialog.close();
}
dialog.addEventListener('cancel',event=>{
  if(!transactionHistory) return;
  event.preventDefault();
  closeDialog();
});
dialog.addEventListener('close',()=>{openEditor=null;transactionHistory=null;importDraft=null;});
function stockEditor(id) {
  const row=db.stock.find(item=>item.id===id);
  if(id&&(!row||row.archived)) return;
  const existing=row||{status:'Available',warehouse:view.stock.warehouse};
  openModal(row?'Edit Stock Item':'Add Stock Item','Record material details and the warehouse balance.',
    `<form id="stock-form" class="form-grid">
    ${field('Material code',input('code',existing.code,'text','required maxlength="40"'))}
    ${field('SAP name',input('sap',existing.sap,'text','required maxlength="100"'))}
    ${field('Product name',input('product',existing.product,'text','required maxlength="100"'))}
    ${field('Packaging',input('pack',existing.pack,'text','required maxlength="65" placeholder="50 kg bag"'))}
    ${field('Warehouse',select('warehouse',warehouseOptions(),existing.warehouse,'Select warehouse','required'))}
    ${field('Balance (MT)',input('balance',existing.balance,'number','min="0" step="0.001" required'))}
    ${field('Stock status',select('status',Object.keys(statuses),existing.status,'','required'))}
    <div class="full">${field('Comments',textarea('comment',existing.comment,'maxlength="300"'))}</div>${statusBox}</form>
    ${row&&row.balance===0?button('Archive Stock Item',null,'archive-ask',{data:safeId(row.id)}):''}`,modalButtons('Save Stock Item','stock-form'));
  openEditor=row?{id:row.id,rev:row.rev}:null;
}
function directoryEditor(kind,id) {
  if(!Object.hasOwn(directoryKinds,kind)) return;
  const label=directoryKinds[kind], entry=db[kind+'s'].find(row=>row.id===id);
  if(id&&!entry) return;
  openModal(`${entry?'Edit':'Add'} ${label}`,'',
    `<form id="directory-form" class="form-grid" data-kind="${kind}" ${entry?safeId(entry.id)+' '+safeId(entry.rev??'','rev'):''}>
    <div class="full">${field(label+' name',input('name',entry?.name,'text','required maxlength="100"'))}</div>
    ${kind==='warehouse'?`<div class="full">${field('Location (optional)',input('place',entry?.place,'text','maxlength="120"'))}</div>`:''}
    ${statusBox}</form>${entry?button('Archive '+label,'stop','directory-archive',{data:`${safeId(kind,'kind')} ${safeId(entry.id)}`}):''}`,modalButtons('Save '+label,'directory-form'));
}
function directoryArchivePrompt(kind,id) {
  if(!Object.hasOwn(directoryKinds,kind)) return;
  const entry=sortedDirectory(kind).find(row=>row.id===id);
  if(!entry) return;
  const label=directoryKinds[kind];
  openModal(`Archive ${label}`,entry.name,
    `<form id="directory-archive-form" ${safeId(id)} ${safeId(kind,'kind')} ${safeId(entry.rev,'rev')}>
    <p class="flash warn">This entry will be removed from active lists. Historical transactions will still show its name.</p>${statusBox}</form>`,
    modalButtons('Archive '+label,'directory-archive-form'));
}
async function commit(mutator,message) {
  if(!canWrite()) throw new AccessError('This account has view-only access.');
  const generation=workspaceGeneration;
  const result=await writeStock(mutator);
  if(generation!==workspaceGeneration) throw new AccessError('Sign in to continue.');
  if(Number(result.db.revision)>=Number(db.revision)) db=result.db;
  refreshParts();
  if(message) toast(typeof message==='function'?message(result.result):message);
  return result.result;
}
function archivePrompt(id) {
  const row=db.stock.find(item=>item.id===id&&!item.archived);
  if(!row) return;
  openModal('Archive Stock Item',`${row.code} · ${row.product} · ${warehouseName(db,row.warehouse)}`,
  `<p class="flash warn">Archiving removes this item from active stock pages. Its history and transactions remain available.</p><form id="archive-form">${field('Reason',textarea('reason','','required maxlength="300"'))}${input('id',id,'hidden')}${input('rev',row.rev,'hidden')}${statusBox}</form>`,modalButtons('Archive Stock Item','archive-form'));
}
function archivedStock() {
  const list=db.stock.filter(row=>row.archived);
  openModal('Archived Stock','Archived material records and their history.',
  `<div class="table-wrap" tabindex="0" aria-label="Archived stock"><table><thead><tr><th>Material</th><th>Warehouse</th><th>Archived by</th><th>Archived on</th></tr></thead><tbody>${list.map(row=>`<tr><td>${link(row.code,'history',safeId(row.code))}<span class="sub">${esc(row.product)}</span></td><td>${esc(warehouseName(db,row.warehouse))}</td><td>${esc(row.updatedBy)}</td><td>${dateTime(row.updatedAt)}</td></tr>`).join('')||empty(4,'No archived stock.')}</tbody></table></div>`,button('Close',null,'close'),true);
}
function history(code,warehouse='',confirmation='') {
  const events=db.audit.filter(row=>row.code===code);
  const item=warehouse?stockAt(db,code,warehouse):null;
  const product=item?.product || db.stock.find(row=>row.code===code)?.product || events[0]?.product || '';
  const addTransaction=item?button('New Transaction','plus','history-tx',{primary:true,data:`${safeId(code)} ${safeId(warehouse,'warehouse')}`}):'';
  openModal('Stock History',`${code} · ${product}`,
  `${confirmation?`<p class="flash success" role="status">${esc(confirmation)}</p>`:''}<div class="table-wrap" tabindex="0" aria-label="Stock audit history"><table class="audit-table"><thead><tr><th>Date and time</th><th>User</th><th>Action / Record</th><th>Warehouse</th><th>Previous value</th><th>New value</th><th>Reason / Comment</th></tr></thead><tbody>
  ${events.map(row=>`<tr><td>${dateTime(row.at)}</td><td>${esc(row.user)}</td><td><strong>${esc(row.action)}</strong><span class="sub">${esc(row.kind)} · ${row.movement?link(row.movement,'tx-detail',safeId(row.movement)):esc(row.code)}</span></td><td>${esc(warehouseName(db,row.warehouse))}</td><td>${row.before?auditValue(row.before,row.kind):'—'}</td><td>${row.after?auditValue(row.after,row.kind):'—'}</td><td>${esc(row.reason)||'—'}</td></tr>`).join('')||empty(7,'No audit history.')}</tbody></table></div>`,button('Close',null,'close')+addTransaction,true);
}
function auditValue(value,kind) {
  if(kind==='Transaction') return `${esc(value.type)} <span class="sub">${fmt(value.delta)} MT</span>`;
  return `<details class="audit-values"><summary>${fmt(value.balance)} MT · ${esc(value.archived?'Archived':stockStatus(value))}</summary><div class="sub">${esc(value.code)} · ${esc(value.product)}<br>${esc(value.sap)} · ${esc(value.pack)}<br>${esc(warehouseName(db,value.warehouse))}${value.comment?'<br>'+esc(value.comment):''}</div></details>`;
}
const depotColumns=[
  ['product','Item'],['code','Material Code'],['pack','Packaging Type'],['quantity','Quantity'],
  ['mt','MT'],['average_sales','Average Sales (Daily)'],['system_stock','System Stock (QTY)'],['physical_stock','Physical Stock'],
];
const depotOrderNumber=order=>'DO-'+String(order.order_number).padStart(5,'0');

function depotOrderRows() {
  return orders.map(order=>`<tr><td>${link(depotOrderNumber(order),'depot-detail',safeId(order.id))}</td>
    <td>${esc(order.depot)}</td><td>${esc(dateTime(order.created_at))}</td><td>${esc(order.submitted_by)}</td>
    <td class="t-number">${fmt(order.total_mt)} MT</td><td>${button('View',null,'depot-detail',{data:safeId(order.id)})}</td></tr>`).join('')||empty(6,'No depot orders have been placed yet.');
}

function depotOrdersPage() {
  return pageHead('Depot Orders',assignedDepot?esc(assignedDepot)+' · Your order history':'Orders submitted by depot supervisors.',
    assignedDepot?button('New Depot Order','plus','depot-new',{primary:true}):'')+
    `<div class="table-wrap" tabindex="0"><table><thead><tr><th>Order</th><th>Depot</th><th>Submitted</th><th>Placed by</th><th>Total tonnage</th><th>Action</th></tr></thead><tbody id="depot-orders-body">${depotOrderRows()}</tbody></table></div>`;
}

const depotOrderRow=()=>`<section class="depot-entry">
  <div class="form-grid three">
    ${field('Item',select('item',catalog.map((item,index)=>[index,`${item.product} · ${item.code} · ${item.pack}`]),'','Select item','required'))}
    ${field('Material Code',input('code','','text','readonly'))}
    ${field('Packaging Type',input('pack','','text','readonly'))}
    ${field('Quantity',input('quantity','','number','required min="0.001" step="0.001" max="1000000000"'))}
    ${field('MT',input('mt','','number','required min="0.001" step="0.001" max="1000000000"'))}
    ${field('Average Sales (Daily)',input('average_sales','','number','required min="0" step="0.001" max="1000000000"'))}
    ${field('System Stock (QTY)',input('system_stock','','number','required min="0" step="0.001" max="1000000000"'))}
    ${field('Physical Stock',input('physical_stock','','number','required min="0" step="0.001" max="1000000000"'))}
  </div>
  <button type="button" class="btn" data-depot-row="remove">Remove item</button>
</section>`;

async function depotOrderEditor() {
  if(!assignedDepot) return;
  const generation=workspaceGeneration;
  const depot=assignedDepot;
  openModal('New Depot Order',depot,'<p role="status">Loading items…</p>');
  const itemRequest=dialog.querySelector('[role="status"]');
  try {
    const items=await fetchDepotCatalog();
    if(generation!==workspaceGeneration||!itemRequest.isConnected||!dialog.open) return;
    catalog=items;
    depotOrderRequest=uid();
    if(!catalog.length) {
      itemRequest.textContent='The stock catalog has no active items to order.';
      return;
    }
    openModal('New Depot Order',depot,`<form id="depot-order-form">
      <p class="sub">Enter daily sales and both stock counts using the same unit as the order quantity. MT is calculated when the packaging specifies a weight in kg.</p>
      <div id="depot-order-lines">${depotOrderRow()}</div>
      <button type="button" class="btn" data-depot-row="add">Add item</button>
      <p class="depot-total">Total tonnage <strong id="depot-total">0.00 MT</strong></p>${statusBox}
    </form>`,modalButtons('Place Order','depot-order-form'),true);
    dialog.querySelector('[name="item"]').value='';
  } catch(error) {
    if(itemRequest.isConnected) itemRequest.textContent=error.message;
  }
}

function updateDepotTotal(changed) {
  const form=document.getElementById('depot-order-form');
  if(!form) return;
  const row=changed?.closest('.depot-entry');
  if(row) {
    const itemIndex=row.querySelector('[name="item"]').value;
    const item=itemIndex===''?null:catalog[Number(itemIndex)];
    const field=name=>row.querySelector(`[name="${name}"]`);
    field('code').value=item?.code||'';
    field('pack').value=item?.pack||'';
    const kg=Number(item?.pack.match(/([0-9]+(?:\.[0-9]+)?)\s*kg\b/i)?.[1]||0);
    const weight=field('mt');
    weight.readOnly=kg>0;
    if(kg>0) weight.value=round(Number(field('quantity').value)*kg/1000);
    else if(changed.name==='item') weight.value='';
  }
  const total=[...form.querySelectorAll('[name="mt"]')].reduce((sum,input)=>sum+Number(input.value),0);
  document.getElementById('depot-total').textContent=fmt(round(total))+' MT';
}

dialog.addEventListener('click',event=>{
  const button=event.target.closest('[data-depot-row]');
  const list=document.getElementById('depot-order-lines');
  if(!assignedDepot||!button||!list) return;
  if(button.dataset.depotRow==='add'&&list.children.length<100) {
    list.insertAdjacentHTML('beforeend',depotOrderRow());
    list.lastElementChild.querySelector('[name="item"]').value='';
    list.lastElementChild.querySelector('[name="item"]').focus();
  } else if(button.dataset.depotRow==='remove'&&list.children.length>1) {
    button.closest('.depot-entry').remove();
  }
  updateDepotTotal();
});
for(const type of ['input','change']) dialog.addEventListener(type,event=>{
  if(event.target.form?.id==='depot-order-form') updateDepotTotal(event.target);
});

dialog.addEventListener('submit',async event=>{
  const form=event.target;
  if(form.id!=='depot-order-form') return;
  event.preventDefault();
  const button=event.submitter;
  if(!assignedDepot||!button||button.disabled) return;
  const lines=[...form.querySelectorAll('.depot-entry')].map(row=>{
    const read=name=>row.querySelector(`[name="${name}"]`).value;
    const item=read('item');
    if(item===''||!catalog[Number(item)]) return null;
    const {code,pack}=catalog[Number(item)];
    const numbers=Object.fromEntries(['quantity','mt','average_sales','system_stock','physical_stock']
      .map(name=>[name,read(name)===''?NaN:Number(read(name))]));
    return {code,pack,...numbers};
  });
  if(lines.some(line=>!line||!Object.values(line).slice(2).every(Number.isFinite)||line.quantity<=0||line.mt<=0)) {
    formStatus('Select each item and enter all quantities and a positive weight.');
    return;
  }
  if(new Set(lines.map(line=>JSON.stringify([line.code,line.pack]))).size!==lines.length) {
    formStatus('Combine duplicate items on one line.');
    return;
  }
  button.disabled=true;
  const generation=workspaceGeneration;
  try {
    const id=await submitDepotOrder(depotOrderRequest,lines);
    const history=await fetchDepotOrders();
    if(generation!==workspaceGeneration) return;
    orders=history;
    render(true);
    if(form.isConnected) depotOrderDetail(id);
    toast('Depot order placed.');
  } catch(error) {
    if(form.isConnected) formStatus(error.message);
  } finally {
    button.disabled=false;
  }
});

function depotOrderDocument(order) {
  return `<div class="depot-document"><h2>${esc(order.depot)} · ${depotOrderNumber(order)}</h2>
    <p>Placed by ${esc(order.submitted_by)} · ${esc(dateTime(order.created_at))}</p>
    <div class="table-wrap"><table><thead><tr>${depotColumns.map(([,label])=>`<th>${esc(label)}</th>`).join('')}</tr></thead>
    <tbody>${order.lines.map(line=>`<tr>${depotColumns.map(([key])=>`<td>${esc(typeof line[key]==='number'?fmt(line[key]):line[key])}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="7">Total tonnage</th><td>${fmt(order.total_mt)} MT</td></tr></tfoot></table></div></div>`;
}
function depotOrderDetail(id) {
  const order=orders.find(order=>order.id===id);
  if(!order) return;
  const actions=canWrite()?button('Print','report','depot-print',{data:safeId(id)})+
    button('Save PDF','download','depot-pdf',{data:safeId(id),primary:true}):'';
  openModal('Depot Order','',depotOrderDocument(order),button('Close',null,'close')+actions,true);
}

function exportDepotOrder(id,format) {
  if(!canWrite()) return;
  const order=orders.find(order=>order.id===id);
  if(!order) return;
  if(format==='print') {
    const sheet=document.createElement('section');
    sheet.id='depot-print-sheet';
    sheet.innerHTML=depotOrderDocument(order);
    document.body.append(sheet);
    try {window.print();} finally {sheet.remove();}
    return;
  }
  const rows=[
    depotColumns.map(([,label])=>label),
    ...order.lines.map(line=>depotColumns.map(([key])=>line[key])),
    ['Total tonnage','','','',fmt(order.total_mt)+' MT'],
  ];
  const title=`${depotOrderNumber(order)} · ${order.depot}`;
  download(makePdf(title,rows,{subtitle:`Placed by ${order.submitted_by} | ${dateTime(order.created_at)}`}),depotOrderNumber(order)+'.pdf');
}

function txEditor(fromHistory=null) {
  const item=fromHistory?stockAt(db,fromHistory.code,fromHistory.warehouse):null;
  if(fromHistory&&!item) return;
  const materials=transactionMaterials();
  openModal('New Transaction','Choose the movement and material first. Completed transactions update stock immediately.',
  `<form class="transaction-form" id="tx-form"><div class="form-grid three">
  ${field('Movement type',select('type',movements,'','Select movement type','required'))}
  ${field('Material code',select('code',materials,item?.code,'Select material','required'))}
  ${field('Product',input('product','','text','readonly placeholder="Fills automatically"'))}
  ${field('Warehouse',select('warehouse',item?[[item.warehouse,warehouseName(db,item.warehouse)]]:[],item?.warehouse,'Select material first','required'))}
  <div id="other-warehouse" hidden>${field('Other warehouse',select('otherWarehouse',warehouseOptions(),'','Select warehouse'))}</div>
  ${field('Transaction date',input('date',today(),'date','required'))}
  <div id="output-material" hidden>${field('Finished material code',select('outputCode',materials,'','Select finished material'),'Set up the smaller-bag material in Stock Management if it’s missing.')}</div>
  </div>
  <section id="production-fields" hidden>
    <div class="form-grid three">
      ${field('Finished product destination',select('productionDestination',[['stock','Keep in warehouse stock'],['dispatch','Dispatch directly to customer']],'stock'))}
      ${field('Finished weight (MT)',input('finishedWeight','','number','min="0.001" step="0.001"'))}
    </div>
    <h3>Raw materials used</h3>
    <div id="production-inputs"></div>
    <button type="button" class="btn" data-production-row="add">Add raw material</button>
  </section>
  <h3 id="transaction-quantity-heading">Quantities and weights</h3><div class="form-grid three">
  ${field('Load type',select('loadType',[['bags','Bagged'],['bulk','Bulk (loose)']],'bags'))}
  ${field('Number of bags',input('bags',0,'number','min="0" step="1"'))}
  ${field('Weight per bag (kg)',input('weightKg',calculate({},item).kg,'number','min="0.001" step="0.001"'))}
  ${field('Weighbridge weight (MT)',input('weigh','','number','min="0" step="0.001"'))}
  ${field('Quantity produced (MT)',input('produced','','number','min="0" step="0.001"'))}
  ${field('Accounting weight (MT)',input('accounting','','number','min="0" step="0.001" placeholder="Calculated by default"'))}
  ${field('Number of finished bags',input('outputBags','','number','min="1" step="1"'))}
  ${field('Weight per finished bag (kg)',input('outputKg','','number','min="0.001" step="0.001"'))}
  <div id="adjustment-field" hidden>${field('Signed adjustment (MT)',input('adjustment','','number','step="0.001" placeholder="Example −2.5 or 5"'))}</div>
  </div><div id="tx-calc" class="calc-grid"></div>
  <div id="tx-transport">
  <h3>Transport and delivery</h3><div class="form-grid three">
  ${field('Truck',input('truck','','text','maxlength="30"'))}
  ${field('Trailer 1',input('trailer1','','text','maxlength="30"'))}
  ${field('Trailer 2',input('trailer2','','text','maxlength="30"'))}
  ${field('Transporter',select('transporterId',directoryOptions('transporter'),'','Select transporter'))}
  ${field('Client',select('clientId',directoryOptions('client'),'','Select client'))}
  ${field('Loading point',input('loading','','text','maxlength="100"'))}
  ${field('Offloading point',input('offloading','','text','maxlength="100"'))}
  </div>
  <details><summary>Reference documents</summary><div class="form-grid three">${docFields.map(([key,label])=>field(label,input(key,'','text','maxlength="65"'))).join('')}</div></details>
  </div>
  <div id="tx-notes">${field('Notes',textarea('notes','','maxlength="450"'))}</div>${statusBox}
  </form>`,modalButtons('Complete Transaction','tx-form'),true);
  transactionHistory=fromHistory;
  const {elements}=document.getElementById('tx-form');
  elements.type.value='';
  elements.productionDestination.value='stock';
  elements.code.value=item?.code||'';
  elements.warehouse.value=item?.warehouse||'';
  addProductionInput();
  updateTransactionForm();
  if(fromHistory) elements.type.focus();
}
const stockAtCode=code=>records(db).find(row=>row.code===code);
function transactionMaterials() {
  return unique(records(db).map(row=>row.code)).map(code=>stockAtCode(code))
    .map(({code,product,pack})=>[code,`${code} · ${product} · ${pack}`]);
}
function addProductionInput() {
  document.getElementById('production-inputs').insertAdjacentHTML('beforeend',`
    <div class="form-grid three production-row">
      ${field('Raw material',select('rawCode',[],'','Select raw material','required'))}
      ${field('Weight used (MT)',input('rawWeight','','number','min="0.001" step="0.001" required'))}
      <button type="button" class="btn" data-production-row="remove">Remove</button>
    </div>`);
}
dialog.addEventListener('click',event=>{
  const button=event.target.closest('[data-production-row]');
  if(!button||!canWrite()) return;
  if(button.dataset.productionRow==='add') addProductionInput();
  else if(dialog.querySelectorAll('.production-row').length>1) button.closest('.production-row').remove();
  updateTransactionForm();
});
function updateTransactionForm(changed) {
  const form=document.getElementById('tx-form');
  if(!form) return;
  const el=form.elements, type=el.type.value, code=el.code.value, transfer=isTransfer(type), adjustment=type==='Stock Adjustment'||type==='Stock Count Correction';
  const production=type==='Production';
  const item=stockAtCode(code), repacking=type==='Repacking', bulkAvailable=canMoveBulk(type);
  if(!changed||changed==='code'||changed==='type') {
    const warehouse=el.warehouse.value;
    const whChoices=code?(canOpenStock(type)?warehouseOptions():warehouseOptions().filter(([id])=>stockAt(db,code,id))):[];
    el.warehouse.innerHTML=options([['',code?'Select warehouse':'Select material first'],...whChoices]);
    el.warehouse.value=whChoices.some(([id])=>id===warehouse)?warehouse:whChoices.length===1?whChoices[0][0]:'';
    el.product.value=item?.product||'';
    if(changed==='code'&&item) el.weightKg.value=calculate({},item).kg;
    el.loadType.value=bulkAvailable&&/\b(bulk|loose)\b/i.test(item?.pack||'')?'bulk':'bags';
    const choices=transactionMaterials().filter(([id])=>id!==code&&!/\b(bulk|loose)\b/i.test(stockAtCode(id).pack));
    const selected=changed?el.outputCode.value:'';
    el.outputCode.innerHTML=options([['','Select finished material'],...choices]);
    el.outputCode.value=choices.some(([id])=>id===selected)?selected:'';
  }
  if(!changed||['type','code','warehouse','outputCode'].includes(changed)) {
    const target=stockAt(db,el.outputCode.value,el.warehouse.value)||stockAtCode(el.outputCode.value);
    el.outputKg.value=packageKg(target)??'';
  }
  const receiving=type==='Transfer In', bulk=bulkAvailable&&el.loadType.value==='bulk';
  el.code.parentElement.firstChild.nodeValue=repacking?'Source material code':production?'Finished material code':'Material code';
  const other=document.getElementById('other-warehouse');
  other.hidden=!transfer;
  el.otherWarehouse.required=transfer;
  if(transfer) {
    el.warehouse.parentElement.firstChild.nodeValue=receiving?'Receiving warehouse':'Sending warehouse';
    other.querySelector('label').firstChild.nodeValue=receiving?'Sending warehouse':'Receiving warehouse';
    const current=el.otherWarehouse.value;
    const choices=warehouseOptions().filter(([id])=>id!==el.warehouse.value&&(!receiving||stockAt(db,code,id)));
    el.otherWarehouse.innerHTML=options([['','Select warehouse'],...choices]);
    el.otherWarehouse.value=choices.some(([id])=>id===current)?current:receiving&&choices.length===1?choices[0][0]:'';
  } else el.warehouse.parentElement.firstChild.nodeValue='Warehouse';
  const showField=(name,show,required=false)=>{
    const control=el[name];
    control.closest('label').hidden=!show;
    control.disabled=!show;
    control.required=show&&required;
  };
  showField('loadType',bulkAvailable);
  showField('bags',!bulk&&!repacking&&!production,true);
  showField('weightKg',!bulk&&!repacking&&!production,true);
  showField('weigh',!repacking&&!production,bulk);
  el.weigh.min=bulk?'0.001':'0';
  el.weigh.parentElement.firstChild.nodeValue=bulk?'Net weighbridge weight (MT)':'Weighbridge weight (MT)';
  for(const name of ['produced','accounting']) showField(name,!bulk&&!repacking&&!production);
  showField('outputBags',repacking,true);
  showField('outputKg',repacking,true);
  document.getElementById('output-material').hidden=!repacking;
  el.outputCode.disabled=!repacking;
  el.outputCode.required=repacking;
  const transport=document.getElementById('tx-transport');
  const direct=production&&el.productionDestination.value==='dispatch';
  transport.hidden=repacking||(production&&!direct);
  for(const control of transport.querySelectorAll('input,select')) control.disabled=transport.hidden;
  el.truck.required=direct;
  el.clientId.required=direct;
  document.getElementById('production-fields').hidden=!production;
  document.getElementById('transaction-quantity-heading').hidden=production;
  showField('productionDestination',production,true);
  showField('finishedWeight',production,true);
  const rawChoices=records(db).filter(row=>row.warehouse===el.warehouse.value&&row.code!==code)
    .map(row=>[row.code,`${row.code} · ${row.product} · ${fmt(row.balance)} MT available`]);
  for(const row of form.querySelectorAll('.production-row')) {
    const raw=row.querySelector('select'), selected=raw.value;
    raw.disabled=!production;
    row.querySelector('input').disabled=!production;
    raw.innerHTML=options([['','Select raw material'],...rawChoices]);
    raw.value=rawChoices.some(([key])=>key===selected)?selected:'';
  }
  document.getElementById('adjustment-field').hidden=!adjustment;
  el.adjustment.disabled=!adjustment;
  el.adjustment.required=adjustment;
  el.notes.required=adjustment;
  document.querySelector('#tx-notes label').firstChild.nodeValue=adjustment?'Reason for adjustment':'Notes';
  const values=Object.fromEntries(new FormData(form));
  const calc=calculate(values,item);
  const source=receiving?el.otherWarehouse.value:el.warehouse.value;
  const base=stockAt(db,code,source);
  const subject=stockAt(db,code,el.warehouse.value);
  const repacked=repacking?repackWeight(values):0;
  const needed=repacking?repacked:receiving?calc.delta:Math.max(0,-calc.delta);
  const summary=document.getElementById('tx-calc');
  const metric=(label,value)=>`<div><span class="sub">${label}</span><b>${value}</b></div>`;
  const weight=amount=>Number.isFinite(amount)?`${fmt(amount)} MT`:'—';
  if(production) {
    const total=round(new FormData(form).getAll('rawWeight').reduce((sum,value)=>sum+Number(value),0));
    const finished=Number(el.finishedWeight.value);
    summary.innerHTML=metric('Raw materials used',weight(total))+metric('Finished weight',weight(finished))+
      metric('Production loss',finished<=total?weight(round(total-finished)):'—');
    formStatus(finished>total?'Finished weight cannot exceed the raw materials used.':'','warn');
    return;
  }
  if(repacking) {
    const target=stockAt(db,el.outputCode.value,el.warehouse.value);
    summary.innerHTML=metric('Weight moved to finished bags',weight(repacked))+
      metric('Source balance after repacking',subject?weight(round(subject.balance-repacked)):'—')+
      metric('Finished balance after repacking',el.outputCode.value&&el.warehouse.value?weight(round((target?.balance||0)+repacked)):'—');
  } else {
    const variance=calc.variance===null?'—':badge(weight(calc.variance),varianceTone(db,calc.variance));
    const balances=metric('Accounting weight',weight(adjustment?Math.abs(calc.delta):calc.accounting))+
      metric('Resulting balance',el.warehouse.value&&code?weight(round((subject?.balance||0)+calc.delta)):'—');
    summary.innerHTML=(bulk?'':metric('Expected weight',weight(calc.expected))+metric('Variance',variance))+balances;
  }
  if(base&&needed>base.balance) formStatus(`${warehouseName(db,base.warehouse)} has ${weight(base.balance)} available. The requested quantity is ${weight(needed)}.`,'warn');
  else formStatus('');
}
function txDetail(id) {
  const tx=db.transactions.find(row=>row.id===id);
  if(!tx) return;
  const linked=db.transactions.filter(row=>row.group===tx.group&&row.id!==id);
  openModal(tx.id,`${tx.type} · ${tx.product} · ${warehouseName(db,tx.warehouse)}`,
  `<div class="form-grid three tx-details">${cols.map(([key,label])=>`<div><span class="sub">${esc(label)}</span><strong>${cellText(key,tx)}</strong></div>`).join('')}</div>${tx.voidReason?`<p class="flash">Void reason · ${esc(tx.voidReason)}</p>`:''}${linked.length?`<div class="flash">Linked movements ${linked.map(row=>link(row.id+' '+row.code,'tx-detail',safeId(row.id))).join(' ')}</div>`:''}`,button('Close',null,'close')+(tx.status==='Completed'?(tx.type==='Production Input'?'':button('Edit Details','edit','tx-edit',{data:safeId(id)}))+button('Void Transaction','stop','tx-void',{data:safeId(id)}):''),true);
}
function txDetailsEditor(id) {
  const tx=db.transactions.find(row=>row.id===id&&row.status==='Completed');
  if(!tx) return;
  const repacking=isRepacking(tx.type)||tx.type==='Production Output';
  const fields=repacking?[]:[['truck','Truck'],['trailer1','Trailer 1'],['trailer2','Trailer 2']];
  if(!isTransfer(tx.type)&&!repacking) fields.push(['loading','Loading point'],['offloading','Offloading point']);
  const partyOptions=kind=>sortedDirectory(kind,true).filter(entry=>!entry.archived||entry.id===tx[kind+'Id']).map(({id,name})=>[id,name]);
  openModal('Edit Transaction Details',id,
    `<form id="tx-details-form" class="form-grid" ${safeId(id)} ${safeId(tx.rev,'rev')}>
    ${fields.map(([key,label])=>field(label,input(key,tx[key],'text','maxlength="100"'))).join('')}
    ${(repacking?[]:['transporter','client']).map(kind=>field(directoryKinds[kind],select(kind+'Id',partyOptions(kind),tx[kind+'Id'],`Select ${kind}`))).join('')}
    ${(repacking?[]:docFields).map(([key,label])=>field(label,input(key,tx[key],'text','maxlength="65"'))).join('')}
    <div class="full">${field('Notes',textarea('notes',tx.notes,'maxlength="450"'))}</div>${statusBox}</form>`,modalButtons('Save Details','tx-details-form'));
}
function txVoidPrompt(id) {
  const tx=db.transactions.find(row=>row.id===id&&row.status==='Completed');
  if(!tx) return;
  openModal('Void Transaction',`${id} · ${tx.product}`,
    `<form id="tx-void-form" class="form-grid" ${safeId(id)} ${safeId(tx.rev,'rev')}>
    <p class="flash warn full">Voiding reverses the stock movement and keeps it in the register. ${isRepacking(tx.type)||isTransfer(tx.type)||isProductionBatch(tx.type)?'All linked movements will be reversed together.':''}</p>
    <div class="full">${field('Reason',textarea('reason','','required maxlength="450"'))}</div>${statusBox}</form>`,modalButtons('Void Transaction','tx-void-form'));
}
function settings() {
  openModal('Variance Settings','Set the weight differences that trigger the amber and red indicators.',
    `<form id="variance-form" class="form-grid">${field('Accepted difference (MT)',input('check',db.tolerance.check,'number','min="0" step="0.001" required'),'Green at or below this value.')}${field('Maximum allowed difference (MT)',input('allowed',db.tolerance.allowed,'number','min="0" step="0.001" required'),'Amber up to this value. Red above it.')}${statusBox}</form>`,modalButtons('Save Settings','variance-form'));
}

let importDraft=null;
const columnsForImport=[
  ['code','Material Code',['materialcode','code']],['sap','SAP Name',['sapname','sap']],
  ['product','Product Name',['productname','product']],['pack','Packaging',['packaging','pack']],
  ['warehouse','Warehouse',['warehouse','warehousename']],['balance','Balance',['balance','balanceinmt','balancemt']],
  ['statusComment','Status/Comments',['statuscomments','statuscomment','status','comments']],
];
const uploadHeader=columnsForImport.map(([,label])=>label);
const normalHeader=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
function reviewImport(raw,latest) {
  const columns=raw[0]?.map(normalHeader)||[];
  const index=Object.fromEntries(columnsForImport.map(([key,,aliases])=>[key,columns.findIndex(name=>aliases.includes(name))]));
  const missing=columnsForImport.filter(([key])=>index[key]<0).map(([,label])=>label);
  if(missing.length) throw Error('Missing columns: '+missing.join(', ')+'.');
  const commentIndex=columns.findIndex(name=>name==='comments'||name==='comment');
  const data=raw.slice(1).map((row,i)=>({row,line:i+2})).filter(({row})=>row.some(value=>String(value??'').trim()));
  if(!data.length) throw Error('The file contains headers but no stock records.');
  if(data.length>10000) throw Error('The demo accepts up to 10,000 rows per import.');
  const repetitions=new Map(), stocked=new Map(records(latest).map(row=>[row.code+'|'+row.warehouse,row]));
  const existingCodes=new Set(records(latest).map(row=>row.code));
  const statusMap=new Map(Object.keys(statuses).map(status=>[status.toLowerCase(),status]));
  const lines=data.map(({row,line})=>{
    const values=Object.fromEntries(Object.entries(index).map(([key,position])=>[key,String(row[position]??'').trim()]));
    values.code=values.code.toUpperCase();
    if(values.code) repetitions.set(values.code,(repetitions.get(values.code)||0)+1);
    const selected=latest.warehouses.find(wh=>!wh.archived&&[wh.id,wh.name].some(value=>value.toLowerCase()===values.warehouse.toLowerCase()));
    const warehouse=selected?.id||'';
    const errors=[];
    if(!values.code) errors.push('Missing material code');
    if(!values.sap) errors.push('Missing SAP name');
    if(!values.product) errors.push('Missing product name');
    if(!values.pack) errors.push('Missing packaging');
    if(!warehouse) errors.push('Unrecognized warehouse');
    const balance=/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(values.balance)?values.balance.replaceAll(',',''):values.balance;
    if(!nonNegative(balance)) errors.push('Invalid balance');
    const [candidate,...rest]=values.statusComment.split(/\s*[|:]\s*/);
    const status=statusMap.get(candidate.toLowerCase())||'Available';
    const comment=commentIndex>=0&&commentIndex!==index.statusComment ? String(row[commentIndex]??'').trim() : statusMap.has(candidate.toLowerCase()) ? rest.join(' | ') : values.statusComment;
    const existing=stocked.get(values.code+'|'+warehouse);
    return {line,errors,warehouseInput:values.warehouse,existing:existing?.id,existingMaterial:existingCodes.has(values.code),values:{...values,balance,warehouse,status,comment}};
  });
  lines.forEach(line=>{if(repetitions.get(line.values.code)>1)line.errors.push('Duplicate material code');});
  return lines;
}
function importEntry() {
  openModal('Import Daily Stock','Upload an Excel workbook or CSV file. Review the preview before applying any changes.',
    `<form id="import-form" class="form-grid"><div class="full">${field('Stock file',input('file','','file','accept=".xlsx,.csv,.tsv" required'),'Required columns are included in the template.')}</div>${statusBox}</form><div class="toolbar">${button('Download CSV Template','download','template')}${button('Import History','history','import-history')}</div>`,modalButtons('Preview Import','import-form'));
}
function showImportPreview(file,raw,lines) {
  const valid=lines.filter(row=>!row.errors.length), failed=lines.length-valid.length;
  const counts=[
    ['Valid records',valid.length],['New products',valid.filter(row=>!row.existingMaterial).length],
    ['Updates',valid.filter(row=>row.existing).length],['Duplicate codes',lines.filter(row=>row.errors.includes('Duplicate material code')).length],
    ['Missing codes',lines.filter(row=>row.errors.includes('Missing material code')).length],['Invalid balances',lines.filter(row=>row.errors.includes('Invalid balance')).length],
    ['Unknown warehouses',lines.filter(row=>row.errors.includes('Unrecognized warehouse')).length],['Rows with errors',failed],
  ];
  importDraft={file,raw,lines,revision:db.revision};
  const visible=lines.length<=150?lines:[...lines.filter(row=>row.errors.length),...valid].slice(0,150);
  openModal('Review Daily Stock Import',`${file} · ${lines.length} rows`,
    `<div class="calc-grid">${counts.map(([label,value])=>`<div><span class="sub">${label}</span><b>${value}</b></div>`).join('')}</div>
    ${failed?`<p class="flash warn">${failed} ${failed===1?'row has':'rows have'} errors and will be skipped.</p>`:''}
    ${visible.length<lines.length?'<p class="sub">The preview shows up to 150 rows, prioritizing errors. Confirmation applies all valid rows.</p>':''}
    <div class="table-wrap" tabindex="0" aria-label="Import preview"><table class="report-table"><thead><tr><th>Row</th><th>Material code</th><th>Product</th><th>Warehouse</th><th>Balance (MT)</th><th>Result</th></tr></thead><tbody>
    ${visible.map(({line,errors,values,warehouseInput,existing,existingMaterial})=>`<tr><td>${line}</td><td>${esc(values.code)||'—'}</td><td>${esc(values.product)||'—'}</td><td>${esc(warehouseName(db,values.warehouse)||warehouseInput)||'—'}</td><td>${esc(values.balance)||'—'}</td><td>${errors.length?badge('Error','red')+`<span class="sub">${esc(errors.join(' · '))}</span>`:badge(existing?'Update stock':existingMaterial?'New warehouse balance':'New product',existing?'blue':'green')}</td></tr>`).join('')}
    </tbody></table></div>${statusBox}`,button('Choose Another File',null,'import')+button(valid.length?`Import ${valid.length} Valid Rows`:'Record Failed Import','upload','confirm-import',{primary:!!valid.length}),true);
}
function importHistory() {
  openModal('Import History','Confirmed daily stock uploads and their outcomes.',
    `<div class="table-wrap" tabindex="0" aria-label="Daily stock import history"><table class="report-table"><thead><tr><th>File name</th><th>Date and time</th><th>Uploaded by</th><th>Records</th><th>Successful</th><th>Failed</th><th>Status</th></tr></thead><tbody>${db.imports.map(row=>`<tr><td>${esc(row.file)}</td><td>${dateTime(row.at)}</td><td>${esc(row.user)}</td><td>${esc(row.total)}</td><td>${esc(row.success)}</td><td>${esc(row.failed)}</td><td>${badge(row.status,row.failed?(row.success?'amber':'red'):'green')}</td></tr>`).join('')||empty(7,'No daily stock uploads have been confirmed.')}</tbody></table></div>`,
    button('Back to Upload',null,'import'),true);
}
async function confirmImport(target) {
  const draft=importDraft;
  if(!draft||target.disabled)return;
  target.disabled=true;
  try {
    const result=await commit(latest=>{
      const fresh=reviewImport(draft.raw,latest);
      if(latest.revision!==draft.revision) throw Error('Stock changed after the preview. Review the refreshed preview before importing.');
      const successful=fresh.filter(row=>!row.errors.length);
      const failed=fresh.length-successful.length;
      const at=stamp();
      for(const row of successful) saveStock(latest,row.values,row.existing,at,operator,'Daily stock import · '+draft.file);
      const entry={id:uid(),file:draft.file,at,user:operator,total:fresh.length,success:successful.length,failed,status:failed?(successful.length?'Completed with errors':'Failed'):'Completed'};
      latest.imports.unshift(entry);
      audit(latest,{action:'Daily stock import confirmed',kind:'Import',id:entry.id,after:entry,reason:draft.file,at});
      return entry;
    },entry=>`Import completed · ${entry.success} saved, ${entry.failed} failed.`);
    if(result) importHistory();
  } catch(error) {
    const latest=await fetchStock().catch(()=>db);
    if(latest.revision!==draft.revision&&dialog.open&&canWrite()) {
      db=latest;
      refreshParts();
      showImportPreview(draft.file,draft.raw,reviewImport(draft.raw,db));
      formStatus(error.message,'warn');
    } else {
      target.disabled=false;
      formStatus(error.message);
    }
  }
}

async function submit(event) {
  const form=event.target;
  if(!form.matches('#stock-form,#directory-form,#directory-archive-form,#archive-form,#tx-form,#tx-details-form,#tx-void-form,#variance-form,#import-form'))return;
  event.preventDefault();
  const fields=new FormData(form);
  const values=Object.fromEntries(fields);
  if(form.id==='tx-form'&&values.type==='Production') {
    values.rawCodes=fields.getAll('rawCode');
    values.rawWeights=fields.getAll('rawWeight');
    values.produced=values.finishedWeight;
  }
  const submitter=event.submitter;
  if(!canWrite()||submitter?.disabled)return;
  if(submitter)submitter.disabled=true;
  try{
    if(form.id==='stock-form') {
      const edit=openEditor;
      await commit(latest=>{
        if(edit&&latest.stock.find(row=>row.id===edit.id)?.rev!==edit.rev) throw Error('This stock item changed. Close and reopen it to review the latest values before saving.');
        return saveStock(latest,values,edit?.id);
      },row=>`${row.code} saved successfully.`);
      closeDialog();
    } else if(form.id==='directory-form') {
      const {kind,id,rev}=form.dataset;
      await commit(latest=>saveDirectoryEntry(latest,kind,values,id?{id,rev:rev||undefined}:null),entry=>`${entry.name} saved.`);
      if(form.isConnected) closeDialog();
    } else if(form.id==='directory-archive-form') {
      const {kind,id,rev}=form.dataset;
      await commit(latest=>archiveDirectoryEntry(latest,kind,id,rev),entry=>`${entry.name} archived.`);
      if(form.isConnected) closeDialog();
    } else if(form.id==='archive-form') {
      await commit(latest=>{
        const index=latest.stock.findIndex(row=>row.id===values.id);
        const previous=latest.stock[index];
        if(!previous||previous.rev!==values.rev||previous.balance!==0) throw Error('This record changed. Reopen it to review before archiving.');
        const reason=values.reason.trim();
        if(!reason)throw Error('Enter a reason for archiving.');
        const next={...previous,archived:true,updatedAt:stamp(),updatedBy:operator,rev:uid()};
        latest.stock[index]=next;
        audit(latest,{action:'Stock archived',kind:'Stock',id:next.id,before:previous,after:next,reason,delta:0});
      },'Stock item archived.');
      closeDialog();
    } else if(form.id==='tx-form') {
      const returnToHistory=Boolean(transactionHistory);
      const message=rows=>isProductionBatch(rows[0].type)?'Production batch recorded.':isRepacking(rows[0].type)?'Repacking completed. Both material balances were updated.':rows.length>1?'Transfer completed. Both warehouse balances were updated.':`${rows[0].id} completed. Stock balance updated.`;
      const rows=await commit(latest=>saveTransaction(latest,values),returnToHistory?null:message);
      if(form.isConnected) closeDialog(returnToHistory?message(rows):'');
    } else if(form.id==='tx-details-form'||form.id==='tx-void-form') {
      const {id,rev}=form.dataset;
      const isVoid=form.id==='tx-void-form';
      await commit(latest=>isVoid?voidTransaction(latest,id,rev,values.reason):updateTransactionDetails(latest,id,rev,values),isVoid?'Transaction voided. Stock balances updated.':'Transaction details updated.');
      if(dialog.open&&form.isConnected) txDetail(id);
    } else if(form.id==='variance-form') {
      await commit(latest=>{
        if(!nonNegative(values.check)||!nonNegative(values.allowed)||Number(values.allowed)<Number(values.check))throw Error('The maximum allowed difference must be at least the accepted difference.');
        const before=latest.tolerance;
        if(before.check===Number(values.check)&&before.allowed===Number(values.allowed))return;
        latest.tolerance={check:Number(values.check),allowed:Number(values.allowed)};
        audit(latest,{action:'Variance tolerance updated',kind:'Settings',id:'variance-tolerance',before,after:latest.tolerance,reason:'Variance settings'});
      },'Variance settings saved.');
      closeDialog();
    } else {
      if(!values.file||!values.file.size)throw Error('Choose a non-empty Excel or CSV file.');
      if(values.file.size>10_000_000)throw Error('Choose a file below 10 MB.');
      formStatus('Reading the file…','success');
      const raw=await readTable(values.file);
      if(!dialog.open||!form.isConnected)return;
      const latest=await fetchStock();
      if(!dialog.open||!form.isConnected||!canWrite())return;
      displayStockUpdate(latest);
      const lines=reviewImport(raw,db);
      showImportPreview(values.file.name,raw,lines);
    }
  } catch(error) {
    if(form.isConnected)formStatus(error.message||'Unable to save. Review the form and try again.');
  } finally{
    if(submitter?.isConnected)submitter.disabled=false;
  }
}
dialog.addEventListener('submit',submit);
dialog.addEventListener('input',event=>{
  if(event.target.form?.id==='tx-form' && !['SELECT','TEXTAREA'].includes(event.target.tagName))updateTransactionForm(event.target.name);
});
dialog.addEventListener('change',event=>{
  if(event.target.form?.id==='tx-form'&&event.target.tagName==='SELECT')updateTransactionForm(event.target.name);
});

function filterWarehouse(id) {
  view.stock={...initialFilters(),warehouse:id,expanded:true};
  go('stock');
}
function metric(target) {
  if(target==='low'||target==='out') {
    view.reports={...view.reports,type:target==='low'?'Low Stock Report':'Out-of-Stock Report',start:'',end:'',warehouse:'',product:'',code:'',transporter:'',client:'',movement:'',status:'',page:1};
    go('reports');
  } else if(target==='receipt'||target==='dispatch'||target==='transactions') {
    view.transactions={...view.transactions,search:'',type:target==='receipt'?'Stock Received':target==='dispatch'?'Dispatch':'',warehouse:'',page:1};
    go('transactions');
  } else {
    if(target==='stock')view.stock=initialFilters();
    go(target);
  }
}
const actions={
  go:target=>go(target.dataset.id),
  metric:target=>metric(target.dataset.id),
  close:()=>closeDialog(),
  'warehouse-stock':target=>filterWarehouse(target.dataset.id),
  'warehouse-detail':target=>go('warehouses',target.dataset.id),
  'directory-editor':target=>directoryEditor(target.dataset.kind,target.dataset.id),
  'directory-archive':target=>directoryArchivePrompt(target.dataset.kind,target.dataset.id),
  'new-stock':()=>stockEditor(),
  'edit-stock':target=>stockEditor(target.dataset.id),
  history:target=>history(target.dataset.id,target.dataset.warehouse),
  'history-tx':target=>txEditor({code:target.dataset.id,warehouse:target.dataset.warehouse}),
  'archive-ask':target=>archivePrompt(target.dataset.id),
  archived:archivedStock,
  'new-tx':()=>txEditor(),
  'depot-new':()=>void depotOrderEditor(),
  'depot-detail':target=>depotOrderDetail(target.dataset.id),
  'depot-pdf':target=>exportDepotOrder(target.dataset.id,'pdf'),
  'depot-print':target=>exportDepotOrder(target.dataset.id,'print'),
  'tx-detail':target=>txDetail(target.dataset.id),
  'tx-edit':target=>txDetailsEditor(target.dataset.id),
  'tx-void':target=>txVoidPrompt(target.dataset.id),
  'variance-settings':settings,
  'toggle-stock':target=>{
    view.stock.expanded=!view.stock.expanded;
    target.setAttribute('aria-expanded',String(view.stock.expanded));
    document.getElementById('stock-filters').hidden=!view.stock.expanded;
  },
  'clear-stock':()=>{view.stock={...initialFilters(),expanded:true};render(true);},
  'clear-report':()=>{
    Object.assign(view.reports,{start:'',end:'',warehouse:'',product:'',code:'',transporter:'',client:'',movement:'',status:'',page:1});render(true);
  },
  sort:target=>{
    const key=target.dataset.id, state=view.stock;
    state.dir=state.sort===key?-state.dir:1;
    state.sort=key;refreshParts();
  },
  paginate:target=>{
    const state=view[target.dataset.id];
    state.page=Math.max(1,state.page+Number(target.dataset.direction));refreshParts();
    main.querySelector('#'+target.dataset.id+'-body .table-wrap').scrollTop=0;
  },
  'export-stock':()=>exportData('Filtered Stock',stockCols,stockRows().map(row=>({...row,status:stockStatus(row)})),'csv'),
  'export-tx':()=>exportData('Transaction Register',cols,txRows(),'csv'),
  'report-export':target=>{const data=reportData();exportData(view.reports.type,data.columns,data.rows,target.dataset.id);},
  import:importEntry,
  'import-history':importHistory,
  'confirm-import':confirmImport,
  template:()=>download(makeCsv([uploadHeader]),'daily-stock-template.csv'),
};
function delegated(event) {
  const target=event.target.closest('[data-action]');
  const action=target&&Object.hasOwn(actions,target.dataset.action)&&actions[target.dataset.action];
  if(action&&role&&(role!=='depot_supervisor'||target.dataset.action==='close'||target.dataset.action.startsWith('depot-'))&&allowedAction(target.dataset.action)) action(target);
}
main.addEventListener('click',delegated);
dialog.addEventListener('click',delegated);
const signinForm=document.getElementById('signin-form');
const signinShell=document.getElementById('signin-shell');
const appShell=document.getElementById('app-shell');
const signinStatus=document.getElementById('signin-status');
const signinButton=signinForm.querySelector('button');

function showSigninStatus(message) {
  signinStatus.hidden=!message;
  signinStatus.textContent=message;
}

function updateProfile() {
  const email=account()?.email||account()?.id||'';
  setOperator(email);
  document.getElementById('profile-email').textContent=email;
  document.getElementById('profile-email').title=email;
  document.getElementById('profile-initials').textContent=email.slice(0,2).toUpperCase();
  document.getElementById('profile-role').textContent=assignedDepot?assignedDepot+' Supervisor':canWrite()?'Full Access':'View Only';
}

function clearWorkspace(message='') {
  workspaceGeneration++;
  role='';
  assignedDepot=''; orders=[]; catalog=[]; depotOrderRequest='';
  connected=false;
  db=emptyStockState();
  setOperator('');
  if(dialog.open) dialog.close();
  setMenu(false);
  main.replaceChildren();
  nav.replaceChildren();
  appShell.hidden=true;
  signinShell.hidden=false;
  signinForm.reset();
  showSigninStatus(message);
}

async function openWorkspace() {
  const generation=workspaceGeneration;
  const depot=await depotAssignment();
  const access=depot?'depot_supervisor':await accessRole();
  const [snapshot,history]=await Promise.all([
    depot?emptyStockState():fetchStock(),
    depot||access==='full_access'?fetchDepotOrders():[],
  ]);
  if(generation!==workspaceGeneration) return;
  assignedDepot=depot;
  orders=history;
  db=snapshot;
  role=access;
  connected=true;
  updateProfile();
  signinForm.reset();
  showSigninStatus('');
  signinShell.hidden=true;
  appShell.hidden=false;
  connection();
  render(true);
}

async function leaveWorkspace(message='') {
  clearWorkspace(message);
  signinButton.disabled=true;
  try { await signOut(); }
  finally { signinButton.disabled=false; }
}

async function synchronize() {
  if(!role||synchronizing||document.hidden) return;
  const generation=workspaceGeneration;
  synchronizing=true;
  try {
    const depot=await depotAssignment();
    const access=depot?'depot_supervisor':await accessRole();
    if(generation!==workspaceGeneration) return;
    if(access!==role||depot!==assignedDepot) {
      if(dialog.open) dialog.close();
      await openWorkspace();
      return;
    }
    const [latest,history]=await Promise.all([
      depot?null:fetchStock(db.revision),
      depot||canWrite()?fetchDepotOrders():null,
    ]);
    if(generation!==workspaceGeneration) return;
    if(history) {
      orders=history;
      const body=document.getElementById('depot-orders-body');
      if(body) body.innerHTML=depotOrderRows();
    }
    if(latest) displayStockUpdate(latest);
    connected=true;
  } catch(error) {
    if(generation!==workspaceGeneration) return;
    connected=false;
    if(error instanceof AccessError) await leaveWorkspace(error.message);
  } finally {
    synchronizing=false;
    connection();
  }
}

signinForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(window.self!==window.top||signinButton.disabled) return;
  const {email,password}=Object.fromEntries(new FormData(signinForm));
  signinButton.disabled=true;
  signinButton.textContent='Signing in…';
  showSigninStatus('');
  try {
    await signIn(email.trim(),password);
    await openWorkspace();
  } catch(error) {
    await signOut();
    showSigninStatus(error.message);
    signinForm.elements.password.value='';
  } finally {
    signinButton.disabled=false;
    signinButton.textContent='Sign in';
  }
});

document.getElementById('signout').addEventListener('click',()=>void leaveWorkspace());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void synchronize();});
setInterval(()=>void synchronize(),12000);

if(window.self===window.top) {
  signinShell.hidden=false;
  signinButton.disabled=true;
  signinButton.textContent='Checking session…';
  restoreSession().then(restored=>restored?openWorkspace():null).catch(async error=>{
    await signOut();
    clearWorkspace(error.message);
  }).finally(()=>{
    signinButton.disabled=false;
    signinButton.textContent='Sign in';
  });
} else {
  document.getElementById('frame-notice').hidden=false;
}
