import {test} from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {authInputs} from './public/auth-inputs.mjs';
let serial=0;
async function setup(t,{blockToken=null,failData=false,hash=''}={}){
 const old={fetch:globalThis.fetch,FormData:globalThis.FormData};const {window,document}=parseHTML('<html><body><div id="notice"></div><div id="app"></div><dialog id="editor"></dialog></body></html>');
 Object.assign(globalThis,{window,document,location:{origin:'https://fonduehuesli-reservationen.onrender.com',pathname:'/',hash},history:{replaceState(){}},CSS:{escape:s=>s}});
 const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 window.matchMedia=()=>({matches:false});window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.scrollIntoView=function(){};
 globalThis.FormData=class {constructor(form){this.data=new Map([...form.querySelectorAll('[name]')].map(c=>[c.name,c.value]));}get(k){return this.data.get(k)||'';}};
 const calls=[];let dataFailure=failData;
 globalThis.fetch=async(url,opts)=>{
  const path=new URL(url).pathname;calls.push({path,body:opts.body?JSON.parse(opts.body):null});
  if(path==='/auth/v1/token'){if(blockToken)await blockToken;return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600});}
  if(path==='/auth/v1/user')return Response.json({id:'synthetic-member',email_confirmed_at:'yes'});
  if(path==='/rest/v1/rpc/claim_member')return Response.json({name:'Synthetic',owner:true,email:'test@example.invalid'});
  if(path==='/rest/v1/mail_replies'&&dataFailure)return Response.json({error:'Antwortverlauf momentan nicht erreichbar.'},{status:503});
  if(path.startsWith('/rest/v1/'))return Response.json([]);throw Error('Unexpected test request');
 };
 t.after(()=>{globalThis.fetch=old.fetch;globalThis.FormData=old.FormData;for(const key of ['window','document','location','history','CSS','sessionStorage'])delete globalThis[key];});
 await import('./public/app.mjs?auth-test='+serial++);
 const login=async(email='test@example.invalid',password='synthetic-password')=>{const form=document.querySelector('#auth');form.querySelector('[name=email]').value=email;form.querySelector('[name=password]').value=password;return form.onsubmit({target:form,preventDefault(){}});};
 return {document,calls,storage,login,recoverData(){dataFailure=false;}};
}
test('login submits existing shorter credentials and trims email without changing the password',async t=>{
 const app=await setup(t);const form=app.document.querySelector('#auth');assert(form.hasAttribute('novalidate'));assert.equal(form.querySelector('[name=password]').getAttribute('minlength'),null);
 await app.login('  test@example.invalid  ','short!');assert.deepEqual(app.calls.find(c=>c.path==='/auth/v1/token').body,{email:'test@example.invalid',password:'short!'});assert(app.document.querySelector('[data-view=day]'));assert(app.storage.has('fh-session'));
});
test('invalid or empty login fields show an inline message rather than silently suppressing the button',async t=>{
 const app=await setup(t);await app.login('not-an-email','test');assert(app.document.querySelector('#auth-message').textContent.includes('E-Mail-Adresse'));assert.equal(app.calls.length,0);assert.equal(app.document.querySelector('#auth button').disabled,false);
 await app.login('test@example.invalid','');assert(app.document.querySelector('#auth-message').textContent.includes('Passwort'));assert.equal(app.calls.length,0);
});
test('an in-progress login shows feedback and cannot submit twice',async t=>{
 let release;const token=new Promise(resolve=>release=resolve);const app=await setup(t,{blockToken:token});const pending=app.login();const button=app.document.querySelector('#auth button');assert.equal(button.disabled,true);assert(button.textContent.includes('läuft'));await app.login();assert.equal(app.calls.filter(c=>c.path==='/auth/v1/token').length,1);release();await pending;assert(app.document.querySelector('[data-view=day]'));
});
test('data loading failures keep valid authentication and offer a working retry without entering the password again',async t=>{
 const app=await setup(t,{failData:true});await app.login();assert(app.document.querySelector('#retry-workspace'));assert(app.storage.has('fh-session'));assert(app.document.body.textContent.includes('Anmeldung erfolgreich'));assert.equal(app.document.querySelector('#auth'),null);
 app.recoverData();await app.document.querySelector('#retry-workspace').onclick();assert(app.document.querySelector('[data-view=day]'));assert.equal(app.calls.filter(c=>c.path==='/auth/v1/token').length,1);
});
test('new-password and recovery rules still require ten characters and matching confirmation',()=>{
 const form=values=>({get:k=>values[k]||''});for(const mode of ['signup','password']){
  assert.throws(()=>authInputs(mode,form({email:'test@example.invalid',password:'short',repeat:'short'})),/10 Zeichen/);
  assert.throws(()=>authInputs(mode,form({email:'test@example.invalid',password:'long-enough-password',repeat:'different'})),/stimmen nicht/);
  assert.equal(authInputs(mode,form({email:'test@example.invalid',password:'long-enough-password',repeat:'long-enough-password'})).password,'long-enough-password');
 }
});
