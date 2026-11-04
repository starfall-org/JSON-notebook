/** Google Drive REST adapter based on legacy_capacitor/src/main.ts.
 * OAuth access tokens are supplied per request; never persist them in storage.
 */
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive';
export const FOLDER_MIME='application/vnd.google-apps.folder';
const API='https://www.googleapis.com/drive/v3';

export class DriveAccessExpired extends Error {
  constructor(){super('Google Drive authorization expired. Select Reconnect Google Drive.');this.name='DriveAccessExpired';}
}

export class DriveStore {
  constructor(getToken, request=globalThis.fetch.bind(globalThis)) {
    this.getToken=getToken;
    this.request=request;
  }
  async call(url,init={}) {
    const token=this.getToken();
    if(!token) throw new DriveAccessExpired();
    const headers=new Headers(init.headers);
    headers.set('Authorization', 'Bearer '+token);
    const response=await this.request(url,{...init,headers});
    if(response.status===401) throw new DriveAccessExpired();
    if(!response.ok) throw new Error('Google Drive HTTP '+response.status+': '+(await response.text()).slice(0,700));
    return response;
  }
  filesUrl(query,extra={}) {
    return API+'/files?'+new URLSearchParams({q:query,fields:'nextPageToken,files(id,name,mimeType,parents)',pageSize:'1000',...extra});
  }
  async root() {
    const q=`name='secrets' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`;
    const result=await (await this.call(this.filesUrl(q))).json();
    if(result.files?.length) return result.files[0];
    const created=await this.create('root','secrets',{folder:true});
    return created;
  }
  async children(id) {
    const query=`'${id.replaceAll("'","\\'")}' in parents and trashed=false`;
    const items=[]; let next='';
    do {
      const response=await this.call(this.filesUrl(query,next?{pageToken:next}:{}));
      const data=await response.json();
      items.push(...(data.files||[]));
      next=data.nextPageToken||'';
    }while(next);
    return items;
  }
  async read(id) {
    return (await this.call(API+'/files/'+encodeURIComponent(id)+'?alt=media')).text();
  }
  async write(id,content) {
    await this.call('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media',{
      method:'PATCH',headers:{'Content-Type':'application/json; charset=utf-8'},body:content
    });
  }
  async create(parent,name,{folder=false}={}) {
    const mimeType=folder?FOLDER_MIME:name.toLowerCase().endsWith('.json')?'application/json':'text/markdown';
    const payload={name,mimeType,parents:[parent]};
    const response=await this.call(API+'/files?fields=id,name,mimeType,parents',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    return response.json();
  }
  async rename(id,name) {
    await this.call(API+'/files/'+encodeURIComponent(id),{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})
    });
  }
  async remove(id) {
    await this.call(API+'/files/'+encodeURIComponent(id),{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})
    });
  }
}
