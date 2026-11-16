export const zone = 'Africa/Harare';
export let operator = '';
export function setOperator(email) { operator = email || ''; }
const warehouseColors = ['#2c63ed','#6689f3','#26a3a4','#8a72da'];
export const warehouseName = (db,id) => db.warehouses.find(item => item.id === id)?.name || id;
export const statuses = {
  'Available':'green','Low Stock':'amber','Out of Stock':'red','Reserved':'blue',
  'Quarantined':'darkred','Damaged':'darkred','Pending Quality Check':'amber',
  'Pending Release':'purple','In Transit':'grey','Under Investigation':'amber',
  'Reserved for Contract':'blue','Awaiting Transfer':'teal',
};
export const movements = ['Stock Received','Production','Dispatch','Transfer Out','Transfer In','Stock Adjustment','Return','Damaged Stock','Stock Count Correction'];
export const directoryKinds = {warehouse:'Warehouse',transporter:'Transporter',client:'Client'};
export const partyName = (db,kind,tx) => db[kind+'s'].find(entry=>entry.id===tx[kind+'Id'])?.name || tx[kind] || '';
const activeEntry = (db,kind,id) => db[kind+'s'].find(entry=>entry.id===id&&!entry.archived);
export const cols = [
  ['date','Date'],['truck','Truck'],['trailer1','Trailer 1'],['trailer2','Trailer 2'],['transporter','Transporter'],
  ['bags','Number of Bags'],['status','Status'],['produced','Qty Produced'],['weigh','Weighbridge Weight'],
  ['expected','Expected Weight'],['variance','Variance'],['accounting','Accounting Weight'],['out','Total MT Out'],
  ['balance','Stock Balance'],['invoice','Invoice/Contract'],['grv','GRV'],['dv','DV'],['stv','STV'],
  ['beiraDv','Beira DV'],['loading','Loading Point'],['offloading','Offloading Point'],['clientDoc','Client Doc No.'],
  ['client','Client'],['eiz','EIZ Release'],['delNote','Del/Col Note'],['notes','Notes'],
  ['id','Transaction ID'],['code','Material Code'],['product','Product'],['warehouse','Warehouse'],
  ['type','Movement Type'],['createdBy','Created By'],['createdAt','Created Date and Time'],
  ['updatedBy','Last Updated By'],['updatedAt','Last Updated Date and Time'],
];
export const docFields = [['invoice','Invoice / Contract'],['grv','GRV'],['dv','DV'],['stv','STV'],['beiraDv','Beira DV'],['clientDoc','Client Doc No.'],['eiz','EIZ Release'],['delNote','Del / Col Note']];
export const stockCols = [['code','Material Code'],['sap','SAP Name'],['product','Product Name'],['pack','Packaging'],['warehouse','Warehouse'],['balance','Balance in MT'],['status','Status'],['comment','Comments'],['updatedAt','Last Updated'],['updatedBy','Updated By']];
export const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format(new Date());
export const stamp = () => new Date().toISOString();
export const round = value => Math.round(value*1000)/1000;
export const numeric = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
export const nonNegative = value => numeric(value) && Number(value) >= 0;
export const isLow = row => row.balance > 0 && row.status !== 'Out of Stock' && (row.status === 'Low Stock' || row.balance < 20);
export const isOut = row => row.balance <= 0 || row.status === 'Out of Stock';
export const stockStatus = row => row.status === 'Available' || row.status === 'Low Stock' || row.status === 'Out of Stock'
  ? (row.balance <= 0 || row.status === 'Out of Stock' ? 'Out of Stock' : row.balance < 20 || row.status === 'Low Stock' ? 'Low Stock' : 'Available')
  : row.status;
export const records = db => db.stock.filter(row => !row.archived);
export const stockAt = (db,code,warehouse) => records(db).find(row => row.code === code && row.warehouse === warehouse);
export const isTransfer = type => type === 'Transfer Out' || type === 'Transfer In';
export const canOpenStock = type => ['Stock Received','Production','Return','Transfer In'].includes(type);
const signed = type => type === 'Stock Adjustment' || type === 'Stock Count Correction';
const outgoing = type => ['Dispatch','Transfer Out','Damaged Stock'].includes(type);
let fallbackId = 0;
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${++fallbackId}`;
export const nextTxId = db => `TX-${String(++db.sequence).padStart(5,'0')}`;

export function audit(db,{action,kind,id,before=null,after=null,reason='',at=stamp(),user=operator,delta=null,movement=''}) {
  const record = after || before || {};
  db.audit.unshift({id:uid(),action,kind,recordId:id,before:structuredClone(before),after:structuredClone(after),reason,at,user,delta,movement,code:record.code||'',product:record.product||'',warehouse:record.warehouse||''});
  db.lastUser = user;
}

const nameKey = name => name.trim().toLowerCase();

export function saveDirectoryEntry(db,kind,values,editing,at=stamp(),user=operator) {
  if(!Object.hasOwn(directoryKinds,kind)) throw Error('Choose a directory.');
  const label=directoryKinds[kind];
  const list=db[kind+'s'];
  const index=editing?list.findIndex(entry=>entry.id===editing.id):-1;
  const before=list[index];
  if(editing&&(!before||before.archived||before.rev!==editing.rev)) throw Error(`This ${kind} changed. Reopen it before saving.`);
  const name=String(values.name||'').trim();
  const place=String(values.place||'').trim();
  if(!name||name.length>100) throw Error(`Enter a ${kind} name up to 100 characters.`);
  if(kind==='warehouse'&&place.length>120) throw Error('Enter a location up to 120 characters.');
  if(list.some(entry=>entry.id!==before?.id&&nameKey(entry.name)===nameKey(name))) throw Error(`A ${kind} with this name already exists.`);
  const entry={...before,id:before?.id||uid(),name,updatedAt:at,updatedBy:user,rev:uid()};
  if(kind==='warehouse') {
    entry.place=place;
    entry.color=before?.color||warehouseColors[list.length%warehouseColors.length];
  }
  if(before) list[index]=entry;
  else list.push(entry);
  audit(db,{action:label+(before?' updated':' added'),kind:label,id:entry.id,before,after:entry,at,user});
  return entry;
}

export function saveStock(db,values,id,at=stamp(),user=operator,source='') {
  const old = db.stock.find(row => row.id === id);
  const code = String(values.code||'').trim().toUpperCase();
  const sap = String(values.sap||'').trim();
  const product = String(values.product||'').trim();
  const pack = String(values.pack||'').trim();
  if (!code || !sap || !product || !pack) throw Error('Enter a material code, SAP name, product name and packaging.');
  if (!activeEntry(db,'warehouse',values.warehouse)) throw Error('Select an active warehouse.');
  if (!nonNegative(values.balance)) throw Error('Enter a valid stock balance of zero or more.');
  if (!Object.hasOwn(statuses,values.status)) throw Error('Select a stock status.');
  const duplicates = db.stock.filter(row => row.code === code && row.id !== id && !row.archived);
  if (old && old.code !== code && (db.transactions.some(tx => tx.code === old.code) || db.stock.some(row => row.id !== old.id && row.code === old.code))) {
    throw Error('This material code is used in the transaction register or another warehouse.');
  }
  if (old && old.warehouse !== values.warehouse && db.transactions.some(tx => tx.code === old.code && tx.warehouse === old.warehouse)) {
    throw Error('Use a transfer to move stock with an existing transaction history.');
  }
  if (duplicates.some(row => row.warehouse === values.warehouse) || (duplicates.length && !source && (!old || old.code !== code))) {
    throw Error('This material code already exists.');
  }
  const row = {id:old?.id || uid(),code,sap,product,pack,warehouse:values.warehouse,balance:round(Number(values.balance)),status:values.status,comment:String(values.comment||'').trim(),updatedAt:at,updatedBy:user,rev:uid(),archived:false};
  if (old) db.stock[db.stock.indexOf(old)] = row;
  else db.stock.push(row);
  audit(db,{action:old?'Stock updated':'Stock item added',kind:'Stock',id:row.id,before:old,after:row,at,user,reason:source||row.comment,delta:round(row.balance-(old?.balance||0))});
  return row;
}

export function calculate(values,item) {
  const guessedKg = Number(item?.pack.replaceAll(',', '').match(/([\d.]+)\s*kg/i)?.[1] || 50);
  const kg = numeric(values.weightKg) ? Number(values.weightKg) : guessedKg;
  const expected = round(Number(values.bags||0)*kg/1000);
  const variance = numeric(values.weigh) ? round(Number(values.weigh)-expected) : null;
  const accounting = numeric(values.accounting) ? round(Number(values.accounting)) : numeric(values.weigh) ? round(Number(values.weigh)) : values.type === 'Production' && numeric(values.produced) ? round(Number(values.produced)) : expected;
  const amount = signed(values.type) ? Number(values.adjustment||0) : outgoing(values.type) ? -accounting : accounting;
  return {kg,expected,variance,accounting,delta:round(amount)};
}

export function varianceTone(db,value) {
  if (value === null || value === '') return 'grey';
  const gap = Math.abs(value);
  if (gap <= db.tolerance.check) return 'green';
  return gap <= db.tolerance.allowed ? 'amber' : 'red';
}

export function saveTransaction(db,values,at=stamp(),user=operator) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date||'') || !movements.includes(values.type)) throw Error('Enter a valid date and movement type.');
  if (!activeEntry(db,'warehouse',values.warehouse)) throw Error('Select an active warehouse.');
  const stock = stockAt(db,values.code,values.warehouse);
  const sending = values.type === 'Transfer In' ? stockAt(db,values.code,values.otherWarehouse) : null;
  if (values.type === 'Transfer In' && !sending) throw Error('Select a sending warehouse that holds this material.');
  const template = !stock&&canOpenStock(values.type) ? sending||records(db).find(row=>row.code===values.code) : null;
  const item = stock || (template ? {...template,id:uid(),warehouse:values.warehouse,balance:0,status:'Available',comment:''} : null);
  if (!item) throw Error('Select a material code and warehouse with an active stock record.');
  const transporter=activeEntry(db,'transporter',values.transporterId);
  const client=activeEntry(db,'client',values.clientId);
  if (values.transporterId&&!transporter) throw Error('Select a valid transporter.');
  if (values.clientId&&!client) throw Error('Select a valid client.');
  if (!nonNegative(values.bags) || !Number.isInteger(Number(values.bags))) throw Error('Enter a whole number of bags of zero or more.');
  if (values.weigh !== '' && values.weigh != null && !nonNegative(values.weigh)) throw Error('Weighbridge weight must be zero or more.');
  if (values.produced !== '' && values.produced != null && !nonNegative(values.produced)) throw Error('Production weight must be zero or more.');
  if (values.accounting !== '' && values.accounting != null && !nonNegative(values.accounting)) throw Error('Accounting weight must be zero or more.');
  if (values.weightKg !== '' && values.weightKg != null && (!numeric(values.weightKg) || Number(values.weightKg) <= 0)) throw Error('Weight per bag must be greater than zero.');
  if (signed(values.type) && (!String(values.notes||'').trim() || !numeric(values.adjustment))) throw Error('Stock adjustments and count corrections require a quantity and reason.');
  const transfer = isTransfer(values.type);
  if (transfer && (!activeEntry(db,'warehouse',values.otherWarehouse) || values.otherWarehouse === item.warehouse)) {
    throw Error('Select different sending and receiving warehouses.');
  }
  const primary = calculate(values,item);
  if (!primary.delta) throw Error('Enter a movement quantity greater than zero. Adjustments can also use a negative quantity.');
  const other = transfer ? stockAt(db,item.code,values.otherWarehouse) : null;
  const counter = transfer ? (other || {...item,id:uid(),warehouse:values.otherWarehouse,balance:0,status:'Available',comment:''}) : null;
  const legs = [{row:item,type:values.type,delta:primary.delta}];
  if (counter) legs.push({row:counter,type:values.type === 'Transfer Out' ? 'Transfer In' : 'Transfer Out',delta:-primary.delta});
  for (const leg of legs) {
    if (leg.delta < 0 && -leg.delta > leg.row.balance) {
      throw Error(`${warehouseName(db,leg.row.warehouse)} has ${leg.row.balance.toFixed(2)} MT available. The requested quantity is ${(-leg.delta).toFixed(2)} MT.`);
    }
  }
  const group = uid();
  return legs.map(({row,type,delta}) => {
    const balance = round(row.balance+delta);
    const status = balance <= 0 ? 'Out of Stock' : ['Available','Low Stock','Out of Stock'].includes(row.status) ? (balance < 20 ? 'Low Stock' : 'Available') : row.status;
    const updated = {...row,balance,status,updatedBy:user,updatedAt:at,rev:uid()};
    const index = db.stock.findIndex(stock => stock.id === row.id);
    const before = index < 0 ? null : row;
    if (index < 0) db.stock.push(updated);
    else db.stock[index] = updated;
    const tx = {
      ...values,id:nextTxId(db),group,product:item.product,code:item.code,warehouse:row.warehouse,type,delta,
      transporterId:transporter?.id||'',transporter:transporter?.name||'',clientId:client?.id||'',client:client?.name||'',
      status:'Completed',bags:Number(values.bags),produced:numeric(values.produced)?Number(values.produced):'',
      weigh:numeric(values.weigh)?Number(values.weigh):'',expected:primary.expected,variance:primary.variance,
      accounting:signed(type)?Math.abs(delta):primary.accounting,out:delta<0?-delta:0,balance,
      loading:transfer?warehouseName(db,legs.find(leg=>leg.delta<0).row.warehouse):values.loading,
      offloading:transfer?warehouseName(db,legs.find(leg=>leg.delta>0).row.warehouse):values.offloading,
      createdBy:user,createdAt:at,updatedBy:user,updatedAt:at,rev:uid(),
    };
    db.transactions.unshift(tx);
    audit(db,{action:type,kind:'Stock',id:row.id,before,after:updated,at,user,reason:values.notes||'',delta,movement:tx.id});
    audit(db,{action:'Transaction recorded',kind:'Transaction',id:tx.id,after:tx,at,user,reason:values.notes||'',movement:tx.id});
    return tx;
  });
}

export function emptyStockState() {
  return {
    stock:[], transactions:[], audit:[], imports:[], warehouses:[], transporters:[], clients:[],
    tolerance:{check:.1,allowed:.25}, sequence:0, lastUser:'', revision:'0',
  };
}

export function archiveDirectoryEntry(db,kind,id,rev,at=stamp(),user=operator) {
  if(!Object.hasOwn(directoryKinds,kind)) throw Error('Choose a directory.');
  const before=activeEntry(db,kind,id);
  if(!before||before.rev!==rev) throw Error(`This ${kind} changed. Reopen it before archiving.`);
  if(kind==='warehouse'&&records(db).some(row=>row.warehouse===id)) {
    throw Error('Move or archive all active stock at this warehouse before archiving it.');
  }
  const list=db[kind+'s'];
  const entry={...before,archived:true,updatedAt:at,updatedBy:user,rev:uid()};
  list[list.indexOf(before)]=entry;
  const label=directoryKinds[kind];
  audit(db,{action:label+' archived',kind:label,id,before,after:entry,at,user});
  return entry;
}

function transactionGroup(db,id,rev) {
  const target=db.transactions.find(tx=>tx.id===id);
  if(!target||target.status!=='Completed'||target.rev!==rev) throw Error('This transaction changed. Reopen it before continuing.');
  return db.transactions.filter(tx=>tx.group===target.group&&tx.status==='Completed');
}

export function updateTransactionDetails(db,id,rev,values,at=stamp(),user=operator) {
  const rows=transactionGroup(db,id,rev);
  const fields=['truck','trailer1','trailer2','notes',...docFields.map(([key])=>key)];
  if(!isTransfer(rows[0].type)) fields.push('loading','offloading');
  const changes=Object.fromEntries(fields.map(key=>[key,String(values[key]||'').trim()]));
  for(const kind of ['transporter','client']) {
    const key=kind+'Id', selected=values[key]||'';
    const party=db[kind+'s'].find(entry=>entry.id===selected);
    if(selected&&(!party||(party.archived&&selected!==rows[0][key]))) throw Error(`Select an active ${kind}.`);
    changes[key]=selected;
    changes[kind]=party?.name||'';
  }
  for(const before of rows) {
    const after={...before,...changes,updatedBy:user,updatedAt:at,rev:uid()};
    db.transactions[db.transactions.indexOf(before)]=after;
    audit(db,{action:'Transaction details updated',kind:'Transaction',id:after.id,before,after,at,user,movement:after.id});
  }
}

export function voidTransaction(db,id,rev,reason,at=stamp(),user=operator) {
  const comment=String(reason||'').trim();
  if(!comment) throw Error('Enter a reason for voiding this transaction.');
  const changes=transactionGroup(db,id,rev).map(tx=>{
    if(!activeEntry(db,'warehouse',tx.warehouse)) throw Error('A warehouse linked to this transaction is archived.');
    const before=stockAt(db,tx.code,tx.warehouse)||db.stock.find(row=>row.code===tx.code&&row.warehouse===tx.warehouse);
    if(!before) throw Error('This transaction’s stock record could not be found.');
    const balance=round(before.balance-tx.delta);
    if(balance<0) throw Error(`${warehouseName(db,tx.warehouse)} has insufficient stock to reverse this transaction.`);
    return {tx,before,balance};
  });
  for(const {tx,before,balance} of changes) {
    const status=balance===0?'Out of Stock':stockStatus({...before,balance,status:before.status==='Out of Stock'?'Available':before.status});
    const after={...before,balance,status,archived:before.archived&&balance===0,updatedBy:user,updatedAt:at,rev:uid()};
    db.stock[db.stock.indexOf(before)]=after;
    const voided={...tx,status:'Voided',voidReason:comment,updatedBy:user,updatedAt:at,rev:uid()};
    db.transactions[db.transactions.indexOf(tx)]=voided;
    audit(db,{action:'Transaction reversal',kind:'Stock',id:after.id,before,after,at,user,reason:comment,delta:-tx.delta,movement:tx.id});
    audit(db,{action:'Transaction voided',kind:'Transaction',id:tx.id,before:tx,after:voided,at,user,reason:comment,movement:tx.id});
  }
}
