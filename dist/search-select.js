let active;
const normalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
function targetSelect(event) {
  const select=event.target.closest?.('select');
  if(select&&!select.multiple&&Number(select.getAttribute('size')||0)<=1&&!select.disabled&&!select.matches(':disabled')) return select;
}

function close(restoreFocus=false) {
  if(!active) return;
  const {select,panel,observer}=active;
  active=null;
  observer.disconnect();
  panel.remove();
  if(restoreFocus&&select.isConnected) select.focus({preventScroll:true});
}

function open(select,query='') {
  if(active?.select===select) return;
  close();
  const panel=document.createElement('div');
  panel.className='select-search-panel';
  panel.innerHTML='<input type="search" class="select-search-input" role="combobox" autocomplete="off" aria-autocomplete="list" aria-expanded="true" aria-controls="select-search-options" aria-label="Search options" placeholder="Search options…"><div class="select-search-options" id="select-search-options" role="listbox" aria-label="Matching options"></div>';
  const search=panel.querySelector('input');
  const label=select.getAttribute('aria-label')||[...(select.labels||[])].map(label=>
    [...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim()
  ).filter(Boolean).join(' ');
  if(label) search.setAttribute('aria-label','Search '+label);
  const list=panel.querySelector('[role="listbox"]');
  let choices=[], index=-1;
  const position=()=>{
    if(!select.isConnected||!select.getClientRects().length) return close();
    const rect=select.getBoundingClientRect();
    const roomBelow=window.innerHeight-rect.bottom;
    const above=roomBelow<240&&rect.top>roomBelow;
    const width=Math.min(Math.max(rect.width,240),window.innerWidth-16);
    panel.style.width=width+'px';
    panel.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
    panel.style.top=above?'auto':rect.bottom+4+'px';
    panel.style.bottom=above?window.innerHeight-rect.top+4+'px':'auto';
    list.style.maxHeight=Math.max(56,Math.min(240,(above?rect.top:roomBelow)-56))+'px';
  };
  const highlight=(next,scroll=false)=>{
    if(!choices.length) return;
    list.children[index]?.classList.remove('is-active');
    index=next;
    const option=list.children[index];
    option.classList.add('is-active');
    search.setAttribute('aria-activedescendant',option.id);
    if(scroll) option.scrollIntoView({block:'nearest'});
  };
  const refresh=()=>{
    const terms=normalize(search.value).trim().split(/\s+/).filter(Boolean);
    choices=[...select.options].filter(option=>!option.disabled&&!option.parentElement.disabled&&
      !(select.required&&!option.value)&&terms.every(term=>normalize(option.text+' '+option.value).includes(term)));
    list.replaceChildren();
    search.removeAttribute('aria-activedescendant');
    index=-1;
    if(!choices.length) {
      const empty=document.createElement('div');
      empty.className='select-search-empty';
      empty.setAttribute('role','status');
      empty.textContent='No matching options';
      list.append(empty);
      return;
    }
    list.append(...choices.map((option,i)=>{
      const row=document.createElement('div');
      row.id='select-search-option-'+i;
      row.setAttribute('role','option');
      row.setAttribute('aria-selected',String(option.selected));
      row.textContent=option.text;
      return row;
    }));
    highlight(0);
  };
  const choose=option=>{
    if(!option||![...select.options].includes(option)||select.disabled) return close(true);
    const changed=select.value!==option.value;
    select.value=option.value;
    close(true);
    if(changed) select.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const observer=new MutationObserver(()=>{if(select.disabled)close();else refresh();});
  active={select,panel,observer,position};
  (select.closest('dialog')||document.body).append(panel);
  observer.observe(select,{childList:true,subtree:true,attributes:true,characterData:true});
  position();
  if(!panel.isConnected) return;
  search.value=query;
  refresh();
  search.addEventListener('input',refresh);
  search.addEventListener('keydown',event=>{
    if(event.key==='Tab') { close(true); return; }
    if(!['Escape','Enter','ArrowDown','ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if(event.key==='Escape') close(true);
    else if(event.key==='Enter') choose(choices[index]);
    else if(choices.length) highlight((index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length,true);
  });
  list.addEventListener('pointerdown',event=>event.preventDefault());
  list.addEventListener('click',event=>{
    const option=event.target.closest('[role="option"]');
    if(option) choose(choices[Array.prototype.indexOf.call(list.children,option)]);
  });
  search.focus({preventScroll:true});
}

document.addEventListener('pointerdown',event=>{
  const select=targetSelect(event);
  if(select&&event.button===0) {
    // Cancel the native popup and let the click open the searchable one.
    event.preventDefault();
  }
  if(active&&!active.panel.contains(event.target)&&active.select!==select) close();
},true);
document.addEventListener('click',event=>{
  const select=targetSelect(event);
  if(!select) return;
  event.preventDefault();
  if(active?.select===select) close(true);
  else open(select);
},true);
document.addEventListener('keydown',event=>{
  const select=targetSelect(event);
  if(!select||event.ctrlKey||event.metaKey||event.altKey) return;
  if(event.key.length!==1&&!['Enter','ArrowDown','ArrowUp','F4'].includes(event.key)) return;
  event.preventDefault();
  open(select,event.key.length===1&&event.key!==' '?event.key:'');
},true);
document.addEventListener('focusin',event=>{
  if(active&&!active.panel.contains(event.target)&&event.target!==active.select) close();
});
document.addEventListener('close',event=>{
  if(active&&event.target.contains(active.select)) close();
},true);
window.addEventListener('resize',()=>active?.position());
document.addEventListener('scroll',event=>{
  if(active&&!active.panel.contains(event.target)) active.position();
},true);
