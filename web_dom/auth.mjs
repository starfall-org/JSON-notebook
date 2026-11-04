// Official Firebase Web SDK — Firebase identity is persisted, Google Drive OAuth
// access tokens are returned to app.mjs and kept in RAM only.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,GoogleAuthProvider,signInWithPopup,signOut,
  browserLocalPersistence,setPersistence,onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {DRIVE_SCOPE} from './drive.mjs';

const firebaseApp=initializeApp({
  apiKey:'AIzaSyDk6tw0jfgUzfMA0xJHqKzDWU7MWyHF7Zc',
  authDomain:'awesome-89e82.firebaseapp.com',
  projectId:'awesome-89e82',
  appId:'1:1064411966305:web:977c5dc5c115197e04b320',
  storageBucket:'awesome-89e82.firebasestorage.app',
  messagingSenderId:'1064411966305',
  measurementId:'G-X55SYNVWT3'
});
const auth=getAuth(firebaseApp);
await setPersistence(auth,browserLocalPersistence);

export async function savedIdentity(){
  return new Promise(resolve=>{
    const unsubscribe=onAuthStateChanged(auth,user=>{unsubscribe();resolve(user)},()=>{unsubscribe();resolve(null)});
  });
}
export async function signInGoogle(){
  const provider=new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  const result=await signInWithPopup(auth,provider);
  const credential=GoogleAuthProvider.credentialFromResult(result);
  if(!credential?.accessToken)throw new Error('Google Drive permission was not granted');
  return {user:result.user,token:credential.accessToken};
}
export async function signOutGoogle(){await signOut(auth)}
