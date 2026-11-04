import {isObject,matchesEntry} from './model.mjs';

export function h(tag,cls='',text=null){
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==null)el.textContent=String(text);
  return el;
}
export function button(label,callback,{primary=false,small=false,kind='',title=''}={}){
  const el=h('button',['btn',primary?'primary':'',small?'small':'',kind].filter(Boolean).join(' '),label);
  el.type='button';
  if(title)el.title=title;
  el.addEventListener('click',callback);
  return el;
}
export function iconButton(label,title,callback,{mini=false,disabled=false}={}){
  const el=h('button','icon-btn'+(mini?' mini':''),label);
  el.type='button';el.title=title;el.setAttribute('aria-label',title);el.disabled=disabled;
  el.addEventListener('click',callback);
  return el;
}
export function errorBox(message,onclick=null){
  const box=h('div','status error');
  box.append(h('div','',message));
  if(onclick)box.append(button('Reconnect Google Drive',onclick,{small:true}));
  return box;
}
function dialogBase(title){
  const dialog=h('dialog'),body=h('div','dialog-body'),foot=h('div','dialog-foot');
  body.append(h('h2','dialog-title',title));dialog.append(body,foot);
  document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  return {dialog,body,foot};
}
function field(label,value='',tag='input'){
  const wrap=h('div','dialog-field'),caption=h('label','',label),input=h(tag);
  if(tag==='input')input.type='text';
  input.value=value;caption.append(input);wrap.append(caption);
  return {wrap,input};
}
export function askText(title,label,initial='',validate=()=>{}){
  return new Promise(resolve=>{
    const {dialog,body,foot}=dialogBase(title);
    const {wrap,input}=field(label,initial),issue=h('div','dialog-error');
    body.append(wrap,issue);
    const cancel=()=>dialog.close('cancel');
    foot.append(button('Cancel',cancel),button('Save',()=>{
      try{const value=input.value.trim();validate(value);dialog.returnValue='ok';dialog.close('ok');}
      catch(error){issue.textContent=error.message;}
    },{primary:true}));
    dialog.addEventListener('close',()=>resolve(dialog.returnValue==='ok'?input.value.trim():null),{once:true});
    dialog.showModal();input.focus();input.select();
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();foot.lastChild.click();}});
  });
}
export function askConfirm(title,message,confirmText='Confirm'){
  return new Promise(resolve=>{
    const {dialog,body,foot}=dialogBase(title);
    body.append(h('p','subtle',message));
    foot.append(button('Cancel',()=>dialog.close('cancel')),
      button(confirmText,()=>dialog.close('yes'),{primary:true,kind:confirmText.toLowerCase().includes('delete')?'danger':''}));
    dialog.addEventListener('close',()=>resolve(dialog.returnValue==='yes'),{once:true});
    dialog.showModal();
  });
}
export function entryDialog({title='Edit entry',name='',value='',isNew=false,append=false,requireName=true}){
  return new Promise(resolve=>{
    const {dialog,body,foot}=dialogBase(title);
    let nameInput=null;
    if(requireName){const f=field('Key',name);body.append(f.wrap);nameInput=f.input;}
    const error=h('div','dialog-error');
    const fields=h('div','dialog-field');
    const initial=isObject(value)?[]:Array.isArray(value)?[...value]:value===''?[]:[value];
    if(append)initial.push('');
    const inputs=[];
    const renderField=(v='')=>{
      const row=h('div','value-field');
      const input=h('textarea');input.value=v;input.rows=2;
      const del=iconButton('×','Remove value',()=>{inputs.splice(inputs.indexOf(input),1);row.remove()});
      del.classList.remove('mini');
      row.append(input,del);fields.append(row);inputs.push(input);
      return input;
    };
    if(!isObject(value)){
      fields.append(h('label','','Values (empty means an empty string)'));
      for(const v of initial)renderField(v);
      body.append(fields,button('＋ Add value',()=>{renderField().focus()},{small:true}));
    }else body.append(h('p','subtle','This key contains nested entries. Renaming preserves its children.'));
    body.append(error);
    foot.append(button('Cancel',()=>dialog.close('cancel')),button('Save',()=>{
      const key=nameInput?nameInput.value.trim():name;
      if(requireName&&!key){error.textContent='Key cannot be empty';return;}
      dialog.close('save');
      resolve({key,fields:inputs.map(i=>i.value)});
    },{primary:true}));
    dialog.addEventListener('close',()=>{if(dialog.returnValue!=='save')resolve(null)},{once:true});
    dialog.showModal();if(nameInput){nameInput.focus();nameInput.select();}
  });
}
export function renderFileList(container,items,open,options){
  container.replaceChildren();
  if(!items.length){container.append(h('div','empty','No files or folders here.'));return;}
  for(const file of items){
    const row=h('div','file-row');
    const openButton=h('button','file-open');
    openButton.type='button';
    openButton.append(h('span','file-icon',file.mimeType===options.folderMime?'📁':file.name.toLowerCase().endsWith('.json')?'{}':'📄'));
    openButton.append(h('span','file-label',file.name));
    openButton.addEventListener('click',()=>open(file));
    const type=h('span','file-type',file.mimeType===options.folderMime?'FOLDER':file.name.toLowerCase().endsWith('.json')?'JSON':'MD');
    const details=h('details','menu'),summary=h('summary','','⋯'),panel=h('div','menu-items');
    summary.title='File options';details.append(summary,panel);
    const menuItem=(label,action)=>{const el=h('button','',label);el.type='button';el.addEventListener('click',()=>{details.open=false;action(file)});panel.append(el);};
    menuItem('Rename',options.rename);
    if(file.mimeType!==options.folderMime&&file.name.toLowerCase().endsWith('.md'))menuItem('Convert to JSON',options.convert);
    menuItem('Move to trash',options.remove);
    row.append(openButton,type,details);container.append(row);
  }
}

function keyLabel(key,needle){
  const span=h('span','tree-key');const pattern=/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;
  const match=pattern.exec(key);
  if(match){const link=h('a','',match[1]);link.href=match[2];link.target='_blank';link.rel='noopener noreferrer';link.title=match[2];span.append(link);}
  else span.textContent=key;
  if(needle&&key.toLowerCase().includes(needle)&&!match)span.classList.add('match-key');
  return span;
}

export function renderTree(container,document,ctx){
  const needle=ctx.search.trim().toLowerCase();
  container.replaceChildren();
  if(!Object.keys(document).length){container.append(h('div','empty','This document is empty. Use Add key to start.'));return;}
  let rendered=0;
  const draw=(object,path=[],depth=0,matchedAncestor=false)=>{
    const parent=h('div',depth===0?'doc-tree':'tree-child');
    for(const [key,value] of Object.entries(object)){
      const matched=matchedAncestor||key.toLowerCase().includes(needle);
      if(needle&&!matched&&!matchesEntry(key,value,needle))continue;
      rendered++;
      const keyPath=[...path,key],keyId=JSON.stringify(keyPath),node=h('section','tree-node '+(depth===1?'depth-1':depth>=2?'depth-deep':''));
      const row=h('div','tree-row');
      const objectValue=isObject(value),childable=objectValue||value==='';
      const collapsed=ctx.collapsed.has(keyId)&&!needle;
      const caret=iconButton(objectValue?(collapsed?'▸':'▾'):'·',objectValue?'Expand/collapse':'Value',()=>{
        if(!objectValue)return;
        if(ctx.collapsed.has(keyId))ctx.collapsed.delete(keyId);else ctx.collapsed.add(keyId);
        renderTree(container,document,ctx);
      },{mini:true,disabled:!objectValue});
      row.append(caret,keyLabel(key,needle));
      const actions=h('div','tree-actions');
      if(childable)actions.append(iconButton('＋','Add child',()=>ctx.add(keyPath),{mini:true}));
      actions.append(iconButton('✎','Edit key and values',()=>ctx.edit(keyPath),{mini:true}));
      actions.append(iconButton('×','Delete key and nested values',()=>ctx.delete(keyPath),{mini:true}));
      actions.append(iconButton('↑','Move up',()=>ctx.reorder(keyPath,-1),{mini:true}));
      actions.append(iconButton('↓','Move down',()=>ctx.reorder(keyPath,1),{mini:true}));
      actions.append(iconButton('⋮','Move key to another location',()=>ctx.moveDialog(keyPath),{mini:true}));
      const handle=iconButton('⠿','Drag to reorder or nest',()=>{}, {mini:true});
      handle.draggable=!needle;
      handle.classList.add('drag-handle');
      handle.addEventListener('dragstart',e=>{
        if(needle){e.preventDefault();return;}
        e.dataTransfer.setData('application/x-secrets-keep-json-key',JSON.stringify(keyPath));
        e.dataTransfer.effectAllowed='move';
      });
      actions.append(handle);row.append(actions);
      row.addEventListener('dragover',e=>{
        if(needle||!e.dataTransfer.types.includes('application/x-secrets-keep-json-key'))return;
        e.preventDefault();node.classList.add('drag-over');
      });
      row.addEventListener('dragleave',()=>node.classList.remove('drag-over'));
      row.addEventListener('drop',e=>{
        e.preventDefault();e.stopPropagation();node.classList.remove('drag-over');
        if(needle)return;
        try {
          const source=JSON.parse(e.dataTransfer.getData('application/x-secrets-keep-json-key'));
          const rect=row.getBoundingClientRect(),fraction=(e.clientY-rect.top)/rect.height;
          const position=childable&&fraction>0.32&&fraction<0.68?'inside':fraction<0.5?'before':'after';
          ctx.move(source,keyPath,position);
        }catch(error){ctx.error(error);}
      });
      node.append(row);
      if(objectValue&&!collapsed){node.append(draw(value,keyPath,depth+1,matched));}
      else if(typeof value==='string'&&value!==''||Array.isArray(value)){
        const strings=Array.isArray(value)?value:[value];
        for(const text of strings){
          if(needle&&!matched&&!text.toLowerCase().includes(needle))continue;
          const valueRow=h('div','value-block'),code=h('pre','',text);
          valueRow.append(code,iconButton('⧉','Copy this value',()=>ctx.copy(text),{mini:true}));
          node.append(valueRow);
        }
      }
      parent.append(node);
    }
    return parent;
  };
  container.append(draw(document));
  if(!rendered)container.append(h('div','empty','No matching keys or values.'));
}
