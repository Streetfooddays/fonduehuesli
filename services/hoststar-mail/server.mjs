import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {verify,list,detail,send,validateAccount} from './mail.mjs';
export function createGateway(token,ops={verify,list,detail,send}){
if(!token||token.length<40)throw Error('MAIL_GATEWAY_TOKEN is required');
let active=0;
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
function authorized(req){const value=req.headers.authorization||'';const expected='Bearer '+token;return value.length===expected.length&&timingSafeEqual(Buffer.from(value),Buffer.from(expected));}
async function body(req){let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>130000)throw Error('TOO_LARGE');raw+=chunk;}return JSON.parse(raw);}
const server=http.createServer(async(req,res)=>{if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{ok:true});if(!authorized(req))return json(res,401,{error:'Unauthorized'});if(req.method==='GET'&&req.url==='/health')return json(res,200,{ready:true});if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});if(active>=8)return json(res,429,{error:'BUSY'});active++;try{const b=await body(req);validateAccount(b.account);let result;if(req.url==='/verify')result=await ops.verify(b.account);else if(req.url==='/messages')result=await ops.list(b.account,b.folder,String(b.q||'').slice(0,300));else if(req.url==='/message')result=await ops.detail(b.account,b.id);else if(req.url==='/send')result=await ops.send(b.account,b.message);else return json(res,404,{error:'Not found'});json(res,200,result);}catch(e){const safe=['INVALID_ACCOUNT','INVALID_FOLDER','SENT_FOLDER_MISSING','INVALID_MESSAGE','INVALID_RECIPIENT','MESSAGE_NOT_FOUND','MESSAGE_CHANGED','MESSAGE_TOO_LARGE','TOO_LARGE'];const code=safe.includes(e.message)?e.message:(e.authenticationFailed||e.code==='EAUTH')?'AUTH_FAILED':'MAIL_CONNECTION_FAILED';json(res,code==='AUTH_FAILED'?422:502,{error:code});}finally{active--;}});
server.requestTimeout=30000;server.headersTimeout=15000;
return server;
}
if(import.meta.url===new URL(process.argv[1],'file:').href){
const server=createGateway(process.env.MAIL_GATEWAY_TOKEN);
server.listen(Number(process.env.PORT||10000),'0.0.0.0');
process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),25000).unref();});

}
