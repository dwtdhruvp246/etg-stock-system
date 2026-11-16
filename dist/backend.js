import {supabaseUrl,supabaseKey} from './supabase-config.js';

let storage;
try { storage=globalThis.sessionStorage; } catch {}
const storageKey='etg-stock-session-v1';
const client=globalThis.supabase.createClient(supabaseUrl,supabaseKey,{
  auth:{storage,storageKey,detectSessionInUrl:false,persistSession:Boolean(storage)},
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
  if(error) throw error;
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
    throw Error(result.error.message||'Supabase could not complete the request.');
  }
  return result.data;
}

export async function accessRole() {
  const data=checked(await client.from('etg_stock_users').select('access_role').maybeSingle());
  const role=data?.access_role;
  if(role!=='full_access'&&role!=='view_only') throw new AccessError('This account has no access to the stock workspace. Ask your administrator to assign a role.');
  return role;
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
    const result=mutator(latest);
    const {revision,...data}=latest;
    const response=await client.from(table).update({data,version:Number(revision)+1}).eq('id',1).eq('version',revision).select('version,data').maybeSingle();
    if(response.status===0) throw Error('The connection dropped while saving. Check the record before trying again.');
    const row=checked(response);
    if(row) return {db:unpack(row),result};
    if(await accessRole()!=='full_access') throw new AccessError('This account has view-only access.');
  }
  throw Error('Another user saved changes at the same time. Review the latest record and try again.');
}
