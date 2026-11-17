import {supabaseUrl,supabaseKey} from './supabase-config.js';

let storage;
try { storage=globalThis.sessionStorage; } catch {}
const storageKey='etg-stock-session-v1';
const client=globalThis.supabase.createClient(supabaseUrl,supabaseKey,{
  auth:{storage,storageKey,detectSessionInUrl:false,persistSession:Boolean(storage),autoRefreshToken:globalThis.self===globalThis.top},
});
const table='etg_stock_state';
let currentUser;

export class AccessError extends Error {}
export const account=()=>currentUser;

export async function restoreSession() {
  const {data,error}=await client.auth.getSession();
  if(error||!data.session) return false;
  currentUser=data.session.user;
  return true;
}

export async function signIn(email,password) {
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error) {
    if(error.status===429) throw Error('Too many sign-in attempts. Wait a few minutes and try again.');
    if(!error.status||error.status>=500) throw Error('Sign-in is temporarily unavailable. Try again shortly.');
    throw Error('Check your email and password and try again.');
  }
  currentUser=data.user;
}

export async function signOut() {
  if(!currentUser) return;
  currentUser=null;
  try { await client.auth.signOut({scope:'local'}); }
  catch {}
  finally {
    try { storage?.removeItem(storageKey); } catch {}
  }
}

function checked(result) {
  if(result.error) {
    if(['PGRST205','42P01'].includes(result.error.code)) throw Error('The stock database setup is pending. Ask your administrator to apply the migration.');
    if(result.status===401) throw new AccessError('Your session ended. Sign in again.');
    if(result.error.code==='42501') throw new AccessError('This account does not have permission for this action.');
    if(result.error.code==='23514') throw Error('The database rejected this change. Reload the record and try again.');
    throw Error('The stock service could not complete the request. Try again shortly.');
  }
  return result.data;
}

export async function accessRole() {
  const data=checked(await client.from('etg_stock_users').select('access_role').maybeSingle());
  return data?.access_role;
}

const unpack=row=>({...row.data,revision:String(row.version)});

export async function fetchStock(after) {
  let query=client.from(table).select('version,data').eq('id',1);
  if(after!==undefined) query=query.gt('version',after);
  const row=checked(await query.maybeSingle());
  if(row) return unpack(row);
  if(after===undefined) throw new AccessError('The stock workspace is unavailable for this account.');
  return null;
}

export async function writeStock(mutator) {
  for(let attempt=0;attempt<2;attempt++) {
    const latest=await fetchStock();
    const auditLength=latest.audit.length;
    const result=mutator(latest);
    if(latest.audit.length===auditLength) return {db:latest,result};
    const {revision,...data}=latest;
    const response=await client.from(table).update({data,version:Number(revision)+1}).eq('id',1).eq('version',revision).select('version,data').maybeSingle();
    if(response.status===0) throw Error('The connection dropped while saving. Check the record before trying again.');
    const row=checked(response);
    if(row) return {db:unpack(row),result};
    if(!['full_access','stock_manager'].includes(await accessRole())) throw new AccessError('This account has view-only access.');
  }
  throw Error('Another user saved changes at the same time. Review the latest record and try again.');
}

export async function depotAssignment() {
  const data=checked(await client.from('depot_supervisors').select('depot').maybeSingle());
  return data?.depot||'';
}

export async function fetchDepotCatalog() {
  const items=[];
  for(let offset=0;;offset+=200) {
    const page=checked(await client.rpc('depot_catalog').order('code').order('pack').range(offset,offset+199));
    items.push(...page);
    if(page.length<200) return items;
  }
}

export async function fetchDepotOrders() {
  const orders=[];
  for(let offset=0;;offset+=100) {
    const page=checked(await client.from('depot_orders').select('id,order_number,depot,submitted_by,created_at,lines,total_mt,status,status_changed_at')
      .order('order_number',{ascending:false}).range(offset,offset+99));
    orders.push(...page);
    if(page.length<100) return orders;
  }
}

export async function submitDepotOrder(requestId,lines) {
  return checked(await client.rpc('submit_depot_order',{request_id:requestId,requested_lines:lines}));
}

export async function saveManagedDepotOrder(requestId,lines,depot,edit) {
  return checked(await client.rpc('save_managed_depot_order',{
    request_id:requestId,requested_lines:lines,requested_depot:depot,edit_order:edit,
  }));
}

export async function changeDepotOrderStatus(id,expectedStatus,status) {
  checked(await client.rpc('change_depot_order_status',{order_id:id,expected_status:expectedStatus,new_status:status}));
}

export async function deleteDepotOrder(id) {
  checked(await client.rpc('delete_depot_order',{order_id:id}));
}
