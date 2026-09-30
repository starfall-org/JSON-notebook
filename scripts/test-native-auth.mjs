import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const native = readFileSync(new URL("../src/auth.native.ts", import.meta.url), "utf8");
const session = readFileSync(new URL("../src/session.ts", import.meta.url), "utf8");
const compile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
function setup({previous=true, revoked=false, network=false}={}) {
 const calls={tokens:0,silent:0,clear:[],signIn:0,signOut:0};
 const sdk={
  configure(config){assert.equal(config.offlineAccess,false);assert.deepEqual(Array.from(config.scopes),["drive"]);},
  hasPreviousSignIn(){return previous;},
  getCurrentUser(){return calls.silent || calls.signIn ? {} : null;},
  async signInSilently(){calls.silent++;if(network)throw new Error("offline");return {type:revoked?"noSavedCredentialFound":"success"};},
  async getTokens(){calls.tokens++;return {accessToken:"token-"+calls.tokens};},
  async clearCachedAccessToken(token){calls.clear.push(token);},
  async hasPlayServices(){},
  async signIn(){calls.signIn++;return {type:"success"};},
  async signOut(){calls.signOut++;}
 };
 const context=vm.createContext({
  GoogleSignin:sdk,isSuccessResponse:r=>r.type==="success",isErrorWithCode:e=>"code" in e,
  statusCodes:{SIGN_IN_REQUIRED:"SIGN_IN_REQUIRED"}, DRIVE_SCOPE:"drive",googleWebClientId:"client",
  Date, Error
 });
 const stripped=native.replace(/^import[^;]+;\n/gm,"").replace(/^export \{[^}]+\};\n/gm,"").replace(/\bexport /g,"");
 const manager=compile(session).replace(/\bexport /g,"");
 vm.runInContext(manager+"\n"+compile(stripped),context);
 return {context: vm.runInContext("({getAccessToken, restoreSession, login, logout, LoginRequired})",context),calls};
}
test("native restores account silently and deduplicates concurrent token requests",async()=>{
 const {context:c,calls}=setup();assert.equal(await c.restoreSession(),true);
 const tokens=await Promise.all([c.getAccessToken(),c.getAccessToken(),c.getAccessToken()]);
 assert.deepEqual(tokens,["token-1","token-1","token-1"]);assert.equal(calls.silent,1);assert.equal(calls.signIn,0);assert.equal(calls.tokens,1);
});
test("native 401 refresh clears the previous token and obtains another without sign-in",async()=>{
 const {context:c,calls}=setup();await c.login();
 assert.equal(await c.getAccessToken(true),"token-2");assert.deepEqual(calls.clear,["token-1"]);assert.equal(calls.signIn,1);
});
test("missing or revoked native account requires reconnecting",async()=>{
 const missing=setup({previous:false});assert.equal(await missing.context.restoreSession(),false);
 const {context:c}=setup({revoked:true});await c.restoreSession();await assert.rejects(c.getAccessToken(),e=>e instanceof c.LoginRequired);
});
test("network failure preserves native session for retry and logout clears it",async()=>{
 const {context:c,calls}=setup({network:true});await c.restoreSession();
 await assert.rejects(c.getAccessToken(),/offline/);
 await c.logout();assert.equal(calls.signOut,1);await assert.rejects(c.getAccessToken(),e=>e instanceof c.LoginRequired);
});
