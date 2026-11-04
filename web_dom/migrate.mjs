import {parseVault,serializeVault} from './model.mjs';
import {FOLDER_MIME} from './drive.mjs';

/** A conservative port of lib/markdown_to_json.dart, for explicit legacy import.
 * Never reinterpret Markdown on ordinary file reads, and never remove originals.
 */
function plainText(source,{preserveLinks=false}={}) {
  let value=source.trim()
    .replaceAll('&nbsp;',' ').replaceAll('&#160;',' ')
    .replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
  value=value.replace(/<\/?(?:div|span|p|table|thead|tbody|tr|td|th|br|hr|center)\b[^>]*>/gi,' ');
  value=value.replace(/^>+\s*/,'');
  if(!preserveLinks)value=value.replace(/!?\[([^\]]+)\]\(([^)]+)\)/g,(_m,label,url)=>label+' ('+url+')');
  value=value.replace(/\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|`([^`]+)`/g,(_m,a,b,c,d)=>a??b??c??d);
  value=value.replace(/(^|[^\w])\*([^\s][\s\S]*?[^\s])\*(?!\w)/g,(_m,p,a)=>p+a);
  value=value.replace(/(^|[^\w])_([^\s][\s\S]*?[^\s])_(?!\w)/g,(_m,p,a)=>p+a);
  value=value.replace(/\\([\\`*_{}\[\]()#+.!|>~-])/g,'$1');
  return value.replace(/[ \t]+/g,' ').trim();
}
function tableCells(line) {
  let raw=line.trim();if(!raw.includes('|'))return null;
  if(raw.startsWith('|'))raw=raw.slice(1);
  if(raw.endsWith('|')&&!raw.endsWith('\\|'))raw=raw.slice(0,-1);
  const result=[];let buf='',inCode=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(c==='`')inCode=!inCode;
    if(c==='\\'&&raw[i+1]==='|'){buf+='|';i++;}
    else if(c==='|'&&!inCode){result.push(buf.trim());buf='';}
    else buf+=c;
  }
  result.push(buf.trim());return result.length>=2?result:null;
}
function decoration(line){
  const t=line.trim();
  return /^([-*_]\s*){3,}$/.test(t)||/^<\/?(?:div|span|p|table|thead|tbody|tr|td|th|br|hr)\b[^>]*>\s*$/i.test(t);
}
export function markdownToJson(source) {
  const root={},heads=[],pending=[];
  let item=null;
  function put(parent,key,val,line){
    const name=key.trim();
    if(!name) throw new Error('Empty name at line '+line);
    if(Object.hasOwn(parent,name))throw new Error('Duplicate key '+name+' at line '+line);
    Object.defineProperty(parent,name,{value:val,enumerable:true,writable:true,configurable:true});
  }
  function code(val,line) {
    if(item){item.parent[item.key].push(val);return;}
    if(!heads.length){
      if(root.content===undefined)root.content=[val];
      else if(Array.isArray(root.content))root.content.push(val);
      else throw new Error('Standalone code conflicts with content key at line '+line);
      return;
    }
    const h=heads.at(-1);const current=h.parent[h.key];
    if(typeof current==='object'&&!Array.isArray(current)&&!Object.keys(current).length)h.parent[h.key]=[val];
    else if(typeof current==='string')h.parent[h.key]=[current,val];
    else if(Array.isArray(current))current.push(val);
    else throw new Error('Code conflicts with nested entries at line '+line);
  }
  function flush(){
    while(pending.at(-1)==='')pending.pop();
    if(pending.length){code(pending.join('\n'),1);pending.length=0;}
  }
  const lines=source.replaceAll('\r\n','\n').split('\n');
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!line.trim()){if(pending.length)pending.push('');continue;}
    const h=/^\s{0,3}(#{1,6})\s+(.+?)\s*$/.exec(line);
    if(h){
      flush();const level=h[1].length,key=plainText(h[2],{preserveLinks:true});
      while(heads.length&&heads.at(-1).level>=level)heads.pop();
      item=null;
      const parent=heads.length?heads.at(-1).parent[heads.at(-1).key]:root;
      if(!parent||typeof parent!=='object'||Array.isArray(parent))throw new Error('Heading cannot contain children at line '+(i+1));
      put(parent,key,{},i+1);heads.push({level,parent,key});continue;
    }
    const list=/^\s*-\s+(.+?)\s*$/.exec(line);
    if(list){
      flush();const key=plainText(list[1],{preserveLinks:true});
      let parent=root;
      for(const h of [...heads].reverse()){
        const value=h.parent[h.key];if(value&&typeof value==='object'&&!Array.isArray(value)){parent=value;break;}
      }
      put(parent,key,[],i+1);item={parent,key};continue;
    }
    const inline=/^\s*(`{3,})(.*?)\1\s*$/.exec(line);
    if(inline){flush();code(inline[2],i+1);continue;}
    const fence=/^\s*(`{3,})([^`]*)$/.exec(line);
    if(fence){
      flush();const marker=fence[1],start=i+1,block=[];let closed=false;
      while(++i<lines.length){
        if(lines[i].trim()===marker){closed=true;break;}
        block.push(lines[i]);
      }
      if(!closed)throw new Error('Unclosed code fence at line '+start);
      while(block.at(-1)==='')block.pop();
      const nonblank=block.filter(l=>l.trim());
      const indent=nonblank.length?Math.min(...nonblank.map(l=>l.length-l.trimStart().length)):0;
      code(block.map(l=>l.slice(indent)).join('\n'),start);continue;
    }
    const header=tableCells(line);
    if(header&&i+1<lines.length&&tableCells(lines[i+1])?.every(c=>/^:?-{3,}:?$/.test(c))){
      flush();i++;const rows=[];
      while(i+1<lines.length){
        const cells=tableCells(lines[i+1]);if(!cells)break;i++;
        rows.push(cells.map((v,n)=>plainText(header[n]||'')+': '+plainText(v)).join('; '));
      }
      pending.push(rows.length?rows.join('\n'):header.map(v=>plainText(v)).join('; '));continue;
    }
    if(decoration(line))continue;
    pending.push(plainText(line));
  }
  flush();
  function normalize(value){
    if(Array.isArray(value))return value.length?value:'';
    if(value&&typeof value==='object')return Object.keys(value).length?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):'';
    return value;
  }
  return parseVault(Object.fromEntries(Object.entries(root).map(([k,v])=>[k,normalize(v)])));
}
export async function convertMarkdown(store,file,parentId) {
  if(file.mimeType===FOLDER_MIME||!file.name.toLowerCase().endsWith('.md'))throw new Error('Only Markdown files can be converted');
  const formatted=serializeVault(markdownToJson(await store.read(file.id)));
  const destName=file.name.slice(0,-3)+'.json';
  const matches=(await store.children(parentId)).filter(f=>f.name.toLowerCase()===destName.toLowerCase());
  if(matches.length){
    if(matches.length!==1||matches[0].mimeType===FOLDER_MIME)throw new Error('Conflicting JSON destination: '+destName);
    if(serializeVault(await store.read(matches[0].id))!==formatted)throw new Error('Existing JSON differs: '+destName);
    return 'skipped';
  }
  const created=await store.create(parentId,destName);
  try{
    await store.write(created.id,formatted);
    if(serializeVault(await store.read(created.id))!==formatted)throw new Error('JSON verification failed: '+destName);
  }catch(error){
    try{await store.remove(created.id);}catch{} 
    throw error;
  }
  return 'created';
}
export async function convertFolder(store,id,onProgress=()=>{}) {
  const report={created:0,skipped:0,errors:[]},visited=new Set();
  async function walk(folderId) {
    if(visited.has(folderId))return;
    visited.add(folderId);
    for(const file of await store.children(folderId)){
      if(file.mimeType===FOLDER_MIME){
        try{await walk(file.id);}catch(e){report.errors.push(file.name+': '+e.message);}
      }else if(file.name.toLowerCase().endsWith('.md')){
        onProgress(file.name);
        try{report[await convertMarkdown(store,file,folderId)]++;}
        catch(e){report.errors.push(file.name+': '+e.message);}
      }
    }
  }
  await walk(id);return report;
}
