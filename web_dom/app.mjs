/** Lightweight Secrets Keep web app. DOM-only, no Flutter/CanvasKit.
 * HTML theme and Drive operations are adapted from legacy_capacitor.
 */
import {savedIdentity,signInGoogle,signOutGoogle} from './auth.mjs';
import {DriveStore,DriveAccessExpired,FOLDER_MIME} from './drive.mjs';
import {
  parseVault,serializeVault,isObject,validateFileName,ensureUniqueName,
  addEntry,editEntry,deleteEntry,reorderEntry,moveEntry
} from './model.mjs';
import {convertMarkdown,convertFolder} from './migrate.mjs';
import {h,button,iconButton,errorBox,askText,askConfirm,entryDialog,renderFileList,renderTree} from './dom.mjs';

const app=document.querySelector('#app');
const demoMode=new URLSearchParams(location.search).has('demo');
const state={
  store:null,token:null,user:null,root:null,stack:[],files:[],
  file:null,raw:'',doc:null,error:'',busy:false,
  search:'',fileSearch:'',collapsed:new Set(),demoEnded:false
};

function toast(text){
  const el=h('div','toast',text),container=document.querySelector('#notices');
  container.append(el);
  setTimeout(()=>el.remove(),3200);
}
function setTheme(next){
  const theme=next||localStorage.getItem('secrets-keep.theme')||'system';
  localStorage.setItem('secrets-keep.theme',theme);
  document.documentElement.dataset.theme=theme==='system'?
    (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;
  document.querySelector('meta[name="theme-color"]').content=
    document.documentElement.dataset.theme==='dark'?'#090909':'#f7f7f5';
}
function cycleTheme(){
  const current=localStorage.getItem('secrets-keep.theme')||'system';
  setTheme(current==='system'?'light':current==='light'?'dark':'system');
  render();
}

function folderSort(items){
  return [...items].filter(f=>f.mimeType===FOLDER_MIME||/\.(json|md)$/i.test(f.name))
    .sort((a,b)=>(a.mimeType===FOLDER_MIME?0:1)-(b.mimeType===FOLDER_MIME?0:1)||
      a.name.localeCompare(b.name));
}
function formatError(e){
  if(e instanceof DriveAccessExpired)return e.message;
  if(e?.code==='auth/popup-closed-by-user')return 'Google sign-in was cancelled.';
  if(e?.code==='auth/unauthorized-domain')return 'This Hosting domain is not authorized for Firebase Authentication.';
  return e?.message||String(e);
}
function restoreLoginAfterError(e){
  state.error=formatError(e);
  if(e instanceof DriveAccessExpired)state.token=null;
}
async function run(work){
  if(state.busy)return;
  state.busy=true;state.error='';
  try{await work();}
  catch(e){restoreLoginAfterError(e);}
  finally{state.busy=false;render();}
}
function mountHeader(shell){
  const top=h('header','topbar'),brand=h('div');
  brand.append(h('div','brand','🔐 Secrets Keep'),h('div','brand-sub','HTML · Google Drive'));
  top.append(brand,h('div','spacer'));
  if(state.store)top.append(button('↻ Refresh',()=>run(refresh),{small:true}));
  top.append(iconButton('◐','Change theme',cycleTheme));
  if(state.user||state.store)top.append(button('Sign out',()=>run(signOut),{small:true}));
  shell.append(top);
}
async function connect(){
  const root=await state.store.root();
  const files=await state.store.children(root.id);
  state.root=root;state.stack=[root];state.files=files;
  state.file=null;state.raw='';state.doc=null;state.search='';state.fileSearch='';
  state.collapsed.clear();
}
async function signin(){
  if(state.busy)return;
  // Initiate the popup synchronously within the user gesture.
  const pending=signInGoogle();
  state.busy=true;state.error='';render();
  try{
    const {user,token}=await pending;
    state.user=user;state.token=token;
    state.store=new DriveStore(()=>state.token);
    await connect();
  }catch(e){restoreLoginAfterError(e);state.store=null;}
  finally{state.busy=false;render();}
}
async function signOut(){
  state.token=null;
  if(!demoMode)await signOutGoogle();
  state.store=null;state.root=null;state.stack=[];state.files=[];
  state.file=null;state.doc=null;state.raw='';state.user=null;state.demoEnded=true;
}
async function demoLogin(){
  await run(async()=>{state.store=new DemoStore();await connect();});
}
async function refresh(){
  if(!state.store)return;
  if(state.file){
    const source=await state.store.read(state.file.id);
    state.raw=source;
    if(state.doc)state.doc=parseVault(source);
  }else{
    state.files=await state.store.children(state.stack.at(-1).id);
  }
}
async function folderAt(index){
  await run(async()=>{
    const folder=state.stack[index],files=await state.store.children(folder.id);
    state.stack=state.stack.slice(0,index+1);
    state.file=null;state.doc=null;state.raw='';state.files=files;
    state.fileSearch='';state.search='';state.collapsed.clear();
  });
}
async function openFileOrFolder(entry){
  await run(async()=>{
    if(entry.mimeType===FOLDER_MIME){
      const files=await state.store.children(entry.id);
      state.stack.push(entry);state.files=files;state.file=null;state.doc=null;
      state.fileSearch='';state.search='';return;
    }
    const raw=await state.store.read(entry.id);
    const parsed=entry.name.toLowerCase().endsWith('.json')?parseVault(raw):null;
    state.file=entry;state.raw=raw;state.doc=parsed;
    state.search='';state.collapsed.clear();
  });
}
async function back(){
  if(state.file)return folderAt(state.stack.length-1);
  if(state.stack.length>1)return folderAt(state.stack.length-2);
}
async function createFile(kind){
  const parent=state.stack.at(-1);
  const ext=kind==='json'?'.json':'.md';
  const request=await askText('New '+(kind==='folder'?'folder':kind==='json'?'JSON document':'Markdown file'),'Name','',
    value=>validateFileName(value,{folder:kind==='folder'}));
  if(request===null)return;
  await run(async()=>{
    const name=kind==='folder'?request:request.toLowerCase().endsWith(ext)?request:request+ext;
    validateFileName(name,{folder:kind==='folder'});
    const fresh=await state.store.children(parent.id);
    ensureUniqueName(fresh.map(f=>f.name),name);
    const created=await state.store.create(parent.id,name,{folder:kind==='folder'});
    if(kind==='json'){
      try{await state.store.write(created.id,serializeVault({}));}
      catch(e){try{await state.store.remove(created.id)}catch{}throw e;}
    }
    state.files=await state.store.children(parent.id);
    toast('Created '+name);
  });
}
async function renameFile(file){
  const name=await askText('Rename','Name',file.name,value=>validateFileName(value,{
    folder:file.mimeType===FOLDER_MIME,original:file.name
  }));
  if(name===null||name===file.name)return;
  await run(async()=>{
    const fresh=await state.store.children(state.stack.at(-1).id);
    ensureUniqueName(fresh.map(f=>f.name),name,file.name);
    await state.store.rename(file.id,name);
    state.files=await state.store.children(state.stack.at(-1).id);
    toast('Renamed');
  });
}
async function removeFile(file){
  if(!await askConfirm('Move to trash?','Move '+file.name+' to Google Drive Trash?','Move to trash'))return;
  await run(async()=>{
    await state.store.remove(file.id);
    state.files=await state.store.children(state.stack.at(-1).id);
    toast('Moved to Trash');
  });
}
async function convertOne(file){
  if(!await askConfirm('Convert Markdown to JSON?',
    'Creates a .json copy of '+file.name+'. The Markdown original is preserved. Conflicts are never overwritten.','Convert'))return;
  await run(async()=>{
    const result=await convertMarkdown(state.store,file,state.stack.at(-1).id);
    state.files=await state.store.children(state.stack.at(-1).id);
    toast(result==='created'?'JSON copy created':'Matching JSON already exists');
  });
}
async function convertCurrentFolder(){
  if(!await askConfirm('Migrate Markdown files?','Recursively convert Markdown files in this folder to new JSON copies. Originals are preserved and conflicts are reported.','Migrate'))return;
  await run(async()=>{
    const report=await convertFolder(state.store,state.stack.at(-1).id,name=>toast('Converting '+name));
    state.files=await state.store.children(state.stack.at(-1).id);
    toast('Created: '+report.created+' · already converted: '+report.skipped+' · errors: '+report.errors.length);
    if(report.errors.length)state.error=report.errors.slice(0,5).join(' | ');
  });
}

async function saveDocument(next){
  await run(async()=>{
    const text=serializeVault(next);
    await state.store.write(state.file.id,text);
    state.doc=next;state.raw=text;
    toast('Saved to Google Drive');
  });
}
async function addKey(path){
  const value=path.length?valueAtKey(path):state.doc;
  if(!isObject(value)&&value!==''&&value!==undefined){return editKey(path,true);}
  const draft=await entryDialog({title:'Add entry',isNew:true,value:'',name:''});
  if(!draft)return;
  try{await saveDocument(addEntry(state.doc,path,draft.key,draft.fields));}
  catch(e){restoreLoginAfterError(e);render();}
}
function valueAtKey(path){let value=state.doc;for(const part of path)value=value[part];return value;}
async function editKey(path,append=false){
  const value=valueAtKey(path),name=path.at(-1);
  const draft=await entryDialog({title:'Edit entry',name,value,append});
  if(!draft)return;
  try{await saveDocument(editEntry(state.doc,path,draft.key,draft.fields));}
  catch(e){restoreLoginAfterError(e);render();}
}
async function deleteKey(path){
  if(!await askConfirm('Delete entry?','Delete the entry '+path.at(-1)+' and all of its nested values?','Delete'))return;
  try{await saveDocument(deleteEntry(state.doc,path));}
  catch(e){restoreLoginAfterError(e);render();}
}
async function reorderKey(path,delta){
  try{await saveDocument(reorderEntry(state.doc,path,delta));}
  catch(e){restoreLoginAfterError(e);render();}
}
async function moveKey(source,target,position){
  try{await saveDocument(moveEntry(state.doc,source,target,position));}
  catch(e){restoreLoginAfterError(e);render();}
}
async function moveDialog(source){
  const destinations=[];
  const visit=(node,path=[])=>{
    for(const [key,value] of Object.entries(node)){
      const target=[...path,key];
      destinations.push({path:target,label:target.join(' › '),childable:isObject(value)||value===''});
      if(isObject(value))visit(value,target);
    }
  };
  visit(state.doc);
  const dialog=h('dialog'),body=h('div','dialog-body'),foot=h('div','dialog-foot');
  body.append(h('h2','dialog-title','Move '+source.at(-1)));
  const targetLabel=h('label','','Target key'),targetSelect=h('select');
  for(const d of destinations){
    const opt=h('option','',d.label);opt.value=JSON.stringify(d.path);targetSelect.append(opt);
  }
  targetLabel.className='dialog-field';targetLabel.append(targetSelect);body.append(targetLabel);
  const posLabel=h('label','dialog-field','Position'),posSelect=h('select');
  for(const position of ['before','inside','after']){
    const opt=h('option','',position);opt.value=position;posSelect.append(opt);
  }
  posSelect.value='after';posLabel.append(posSelect);body.append(posLabel);
  const issue=h('div','dialog-error');body.append(issue);
  foot.append(button('Cancel',()=>dialog.close()),button('Move',()=>{
    try{
      const next=moveEntry(state.doc,source,JSON.parse(targetSelect.value),posSelect.value);
      dialog.close();saveDocument(next);
    }catch(e){issue.textContent=e.message;}
  },{primary:true}));
  dialog.append(body,foot);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
async function copy(text){
  try{await navigator.clipboard.writeText(text);toast('Copied');}
  catch(e){toast('Clipboard permission denied');}
}
function currentError(shell){
  if(!state.error)return;
  const needsConnect=!state.token&&!demoMode;
  shell.append(errorBox(state.error,needsConnect?signin:null));
}
function renderLogin(){
  app.replaceChildren();
  const outer=h('div','login-shell'),card=h('section','login-card');
  card.append(h('div','login-icon','🔐'),h('h1','title','Secrets Keep'),
    h('p','','Your JSON vault in Google Drive, rendered with native HTML. No canvas renderer.'));
  if(state.user&&!demoMode)card.append(h('p','subtle','Firebase session restored. Connect Google Drive to continue.'));
  if(state.error)card.append(errorBox(state.error));
  const actions=h('div','login-actions');
  const signinBtn=button(state.user?'Reconnect Google Drive':'Continue with Google',signin,{primary:true});
  signinBtn.disabled=state.busy;actions.append(signinBtn);
  actions.append(button('Explore demo',demoLogin));
  card.append(actions,h('p','subtle','Google OAuth Drive permission is requested on sign-in. Tokens are kept in memory only.'));
  outer.append(card);app.append(outer);
}
function shellPage(){
  app.replaceChildren();
  const shell=h('div','shell');mountHeader(shell);currentError(shell);
  app.append(shell);return shell;
}
function breadcrumbs(shell){
  const bar=h('nav','breadcrumbs');bar.setAttribute('aria-label','Folder path');
  state.stack.forEach((folder,index)=>{
    if(index)bar.append(h('span','subtle','›'));
    const crumb=h('button','crumb'+(index===state.stack.length-1?' current':''),folder.name);
    crumb.type='button';crumb.addEventListener('click',()=>folderAt(index));bar.append(crumb);
  });
  shell.append(bar);
}
function renderFolder(){
  const shell=shellPage(),toolbar=h('div','toolbar');
  breadcrumbs(toolbar);
  toolbar.append(button('＋ Folder',()=>createFile('folder'),{small:true}),
    button('＋ JSON',()=>createFile('json'),{small:true}),
    button('＋ MD',()=>createFile('md'),{small:true}));
  shell.append(toolbar);
  const filter=h('input','search');filter.type='search';filter.placeholder='Search files and folders';
  filter.setAttribute('aria-label','Search files');
  filter.value=state.fileSearch;shell.append(filter);
  const menu=h('div','toolbar');
  menu.append(button('Convert Markdown folder → JSON',convertCurrentFolder,{small:true}));
  shell.append(menu);
  const list=h('div','file-list');
  shell.append(list);
  const draw=()=>renderFileList(list,folderSort(state.files).filter(f=>f.name.toLowerCase().includes(state.fileSearch.toLowerCase())),openFileOrFolder,{
    folderMime:FOLDER_MIME,rename:renameFile,remove:removeFile,convert:convertOne
  });
  filter.addEventListener('input',()=>{state.fileSearch=filter.value;draw()});
  draw();
  shell.append(h('p','subtle','Read and edit JSON directly. Markdown is read-only; conversion creates a separate JSON copy.'));
}
function renderDocument(){
  const shell=shellPage();
  const breadcrumbBar=h('div','toolbar');
  breadcrumbs(breadcrumbBar);shell.append(breadcrumbBar);
  const header=h('div','doc-header');
  header.append(iconButton('‹','Back to folder',back),h('h1','title',state.file.name));
  if(state.doc)header.append(button('＋ Add key',()=>addKey([]),{small:true,primary:true}));
  shell.append(header);
  if(!state.doc){
    shell.append(h('p','subtle','Markdown source (read-only). Choose Convert to JSON from the folder menu to edit a JSON copy.'));
    shell.append(h('pre','raw-text',state.raw));
    return;
  }
  const search=h('input','search');search.type='search';search.placeholder='Search nested keys and values';
  search.setAttribute('aria-label','Search document');
  search.value=state.search;shell.append(search);
  const tree=h('div','');shell.append(tree);
  const ctx={
    search:state.search,collapsed:state.collapsed,add:addKey,edit:editKey,delete:deleteKey,
    reorder:reorderKey,move:moveKey,moveDialog,copy,error:e=>{state.error=formatError(e);render();}
  };
  const draw=()=>{ctx.search=state.search;renderTree(tree,state.doc,ctx)};
  let debounce;
  search.addEventListener('input',()=>{
    state.search=search.value;
    clearTimeout(debounce);debounce=setTimeout(draw,90);
  });
  draw();
  shell.append(h('p','drop-hint','Drag ⠿ onto a key to reorder or nest. Use ↑ / ↓ or ⋮ on touch devices.'));
}
function render(){
  if(!state.store)renderLogin();
  else if(state.file)renderDocument();
  else renderFolder();
}

/** In-memory demo adapter: never makes Google Drive requests or saves secrets. */
class DemoStore {
  constructor(){
    this.serial=0;
    this.nodes=new Map([
      ['demo-root',{id:'demo-root',name:'secrets',mimeType:FOLDER_MIME,parents:['root']}],
      ['demo-cloud',{id:'demo-cloud',name:'cloud',mimeType:FOLDER_MIME,parents:['demo-root']}],
      ['demo-json',{id:'demo-json',name:'services.json',mimeType:'application/json',parents:['demo-root'],content:serializeVault({
        Production:{'API URL':'https://example.internal',Notes:['Example value','A second value']},
        Staging:{Region:'asia-southeast1'}
      })}],
      ['demo-notes',{id:'demo-notes',name:'notes.md',mimeType:'text/markdown',parents:['demo-cloud'],
        content:'# Notes\n\n## Deploy\n\n- **Region**\n\n    ```text\n    asia-southeast1\n    ```\n'}]
    ]);
  }
  async root(){return this.nodes.get('demo-root')}
  async children(id){return [...this.nodes.values()].filter(n=>n.parents?.includes(id))}
  async read(id){const n=this.nodes.get(id);if(!n)throw new Error('File missing');return n.content??''}
  async write(id,content){const n=this.nodes.get(id);if(!n)throw new Error('File missing');n.content=content;}
  async create(parent,name,{folder=false}={}){
    const id='demo-new-'+(++this.serial);
    const node={id,name,mimeType:folder?FOLDER_MIME:name.endsWith('.json')?'application/json':'text/markdown',parents:[parent],content:''};
    this.nodes.set(id,node);return node;
  }
  async rename(id,name){const n=this.nodes.get(id);if(!n)throw new Error('File missing');n.name=name}
  async remove(id){this.nodes.delete(id)}
}

async function initialize(){
  // The old Capacitor web client persisted Drive OAuth tokens unencrypted.
  // Remove that obsolete record; Firebase persists only its own identity.
  try{
    localStorage.removeItem('secret-keep.google-session');
    if(new URLSearchParams(location.hash.slice(1)).has('__sk_access_token')){
      history.replaceState(null,'',location.pathname+location.search);
    }
  }catch{}
  setTheme();
  if(demoMode){await demoLogin();return;}
  try{state.user=await savedIdentity();}
  catch(error){state.error=formatError(error);}
  render();
}
initialize();
