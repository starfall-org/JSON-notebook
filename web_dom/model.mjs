/** Browser-independent JSON vault model, ported from lib/json_document.dart.
 * Keep all primitives strings; never silently coerce or overwrite vault data.
 */
// Use own data properties even for keys such as "__proto__".
function setKey(target,key,value){
  Object.defineProperty(target,key,{value,enumerable:true,writable:true,configurable:true});
}
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function assertValue(value) {
  if (typeof value === 'string') return;
  if (isObject(value)) { for (const v of Object.values(value)) assertValue(v); return; }
  if (Array.isArray(value)) { for (const v of value) assertValue(v); return; }
  throw new Error('Only string values are supported in this vault');
}
export function parseVault(raw) {
  const result = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
  if (!isObject(result)) throw new Error('The root of a vault must be a JSON object');
  assertValue(result);
  return result;
}
export const serializeVault = doc => JSON.stringify(parseVault(doc), null, 2) + '\n';
export const fieldsToValue = fields => fields.length === 0 ? '' : fields.length === 1 ? fields[0] : [...fields];
export function valueAt(document, path) {
  let at = document;
  for (const part of path) {
    if ((isObject(at) && typeof part === 'string' && Object.hasOwn(at, part)) ||
        (Array.isArray(at) && Number.isInteger(part) && part >= 0 && part < at.length)) {
      at = at[part];
    } else throw new Error('Invalid JSON path');
  }
  return at;
}
function mutate(document, callback) {
  const next = structuredClone(document);
  callback(next);
  return parseVault(next);
}
export function addEntry(document, parentPath, key, fields) {
  return mutate(document, next => {
    let parent = valueAt(next, parentPath);
    if (parent === '' && parentPath.length) {
      const owner = valueAt(next, parentPath.slice(0, -1));
      if (!isObject(owner)) throw new Error('Cannot create a child here');
      setKey(owner,parentPath.at(-1),{});
      parent = owner[parentPath.at(-1)];
    }
    if (!isObject(parent)) throw new Error('Edit values here; this key cannot contain children');
    const name = key.trim();
    if (!name) throw new Error('Key cannot be empty');
    if (Object.hasOwn(parent, name)) throw new Error('Key already exists: ' + name);
    setKey(parent,name,fieldsToValue(fields));
  });
}
export function editEntry(document, path, key, fields) {
  return mutate(document, next => {
    if (!path.length) throw new Error('Cannot edit root');
    const parent = valueAt(next, path.slice(0, -1));
    const oldKey = path.at(-1);
    const oldValue = valueAt(next, path);
    const value = isObject(oldValue) ? oldValue : fieldsToValue(fields);
    if (isObject(parent)) {
      const name = key.trim();
      if (!name) throw new Error('Key cannot be empty');
      if (name !== oldKey && Object.hasOwn(parent, name)) throw new Error('Key already exists: ' + name);
      const entries = Object.entries(parent).map(([k,v]) => k === oldKey ? [name,value] : [k,v]);
      for (const k of Object.keys(parent)) delete parent[k];
      for (const [k,v] of entries) setKey(parent,k,v);
    } else if (Array.isArray(parent)) parent[oldKey] = value;
    else throw new Error('Invalid JSON path');
  });
}
export function deleteEntry(document, path) {
  return mutate(document, next => {
    if (!path.length) throw new Error('Cannot delete root');
    const parent = valueAt(next, path.slice(0, -1));
    const key = path.at(-1);
    if (isObject(parent) && Object.hasOwn(parent, key)) delete parent[key];
    else if (Array.isArray(parent) && Number.isInteger(key) && key >= 0 && key < parent.length) parent.splice(key,1);
    else throw new Error('Invalid JSON path');
  });
}
export function reorderEntry(document, path, delta) {
  return mutate(document, next => {
    if (!path.length) throw new Error('Cannot reorder root');
    const parent = valueAt(next, path.slice(0, -1));
    const key = path.at(-1);
    if (!isObject(parent)) throw new Error('Only named keys can be reordered');
    const entries = Object.entries(parent);
    const from = entries.findIndex(([name])=>name===key), to=from+delta;
    if (from<0 || to<0 || to>=entries.length) return;
    entries.splice(to,0,...entries.splice(from,1));
    for (const name of Object.keys(parent)) delete parent[name];
    for (const [name,value] of entries) setKey(parent,name,value);
  });
}
const equalPath=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function moveEntry(document, source, target, position) {
  if (!['before','after','inside'].includes(position) || !source.length || !target.length ||
      source.some(p=>typeof p!=='string') || target.some(p=>typeof p!=='string') ||
      (target.length>=source.length && equalPath(target.slice(0,source.length),source)))
    throw new Error('Invalid key move');
  return mutate(document, next=>{
    const sourceParent = valueAt(next,source.slice(0,-1));
    const sourceKey = source.at(-1);
    if (!isObject(sourceParent) || !Object.hasOwn(sourceParent,sourceKey)) throw new Error('Invalid source');
    const destPath=position==='inside'?target:target.slice(0,-1);
    let destination=valueAt(next,destPath);
    if (position==='inside' && destination==='') {
      const owner=valueAt(next,target.slice(0,-1));
      if (!isObject(owner)) throw new Error('Invalid destination');
      setKey(owner,target.at(-1),{});
      destination=owner[target.at(-1)];
    }
    if (!isObject(destination)) throw new Error('Destination must be a container');
    if (destination!==sourceParent && Object.hasOwn(destination,sourceKey)) throw new Error('Destination key already exists');
    if (position!=='inside' && equalPath(source,target)) throw new Error('Cannot drop onto itself');
    const sourceValue=sourceParent[sourceKey];
    delete sourceParent[sourceKey];
    if (position==='inside') {setKey(destination,sourceKey,sourceValue);return;}
    const ordered=[];
    for(const [key,value] of Object.entries(destination)){
      if(position==='before' && key===target.at(-1)) ordered.push([sourceKey,sourceValue]);
      ordered.push([key,value]);
      if(position==='after' && key===target.at(-1)) ordered.push([sourceKey,sourceValue]);
    }
    if(!ordered.some(([key])=>key===sourceKey)) throw new Error('Invalid drop target');
    for(const key of Object.keys(destination)) delete destination[key];
    for(const [key,value] of ordered) setKey(destination,key,value);
  });
}
export function matchesEntry(key,value,needle) {
  const n=needle.trim().toLowerCase();
  if(!n || key.toLowerCase().includes(n)) return true;
  if(typeof value==='string') return value.toLowerCase().includes(n);
  if(Array.isArray(value)) return value.some(v=>matchesEntry('',v,n));
  if(isObject(value)) return Object.entries(value).some(([k,v])=>matchesEntry(k,v,n));
  return false;
}
export function validateFileName(name,{folder=false,original=null}={}) {
  const value=name.trim();
  if(!value || value==='.' || value==='..' || /[/\\\x00-\x1f]/.test(value)) throw new Error('Invalid file or folder name');
  if(!folder && original) {
    const extension=original.toLowerCase().endsWith('.json')?'.json':'.md';
    if(!value.toLowerCase().endsWith(extension)) throw new Error('Keep '+extension+' when renaming; use Convert to change format');
  }
  return value;
}
export function ensureUniqueName(siblings, name, excluding=null) {
  if(siblings.some(item=>item.toLowerCase()===name.toLowerCase()&&item.toLowerCase()!==excluding?.toLowerCase()))
    throw new Error('File or folder already exists: '+name);
}
