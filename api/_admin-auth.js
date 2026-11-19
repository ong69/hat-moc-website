const crypto=require('crypto');
const COOKIE='hatmoc_admin_session';
const lifetime=30*24*60*60*1000;
const secret=()=>crypto.createHash('sha256').update('hatmoc-admin-cookie-v1:'+process.env.HATMOC_ADMIN_PASSWORD).digest();
const eq=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
function validToken(token){
 if(!process.env.HATMOC_ADMIN_PASSWORD||!token)return false;
 const [exp,mac,extra]=String(token).split('.');
 if(extra||!/^\d{13}$/.test(exp)||!Number.isFinite(Number(exp))||Number(exp)<Date.now()||Number(exp)>Date.now()+lifetime)return false;
 const expected=crypto.createHmac('sha256',secret()).update(exp).digest('hex');
 return eq(mac,expected);
}
function cookieValue(req){const raw=req.headers.cookie||'';const match=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));return match?match.slice(COOKIE.length+1):''}
function isAuthorized(req){const bearer=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');return !!process.env.HATMOC_ADMIN_PASSWORD&&(eq(bearer,process.env.HATMOC_ADMIN_PASSWORD)||validToken(cookieValue(req)))}
function sameOrigin(req){if(['GET','HEAD','OPTIONS'].includes(req.method))return true;const origin=req.headers.origin;if(!origin)return false;const host=req.headers['x-forwarded-host']||req.headers.host;try{return new URL(origin).host===host&&new URL(origin).protocol==='https:'}catch{return false}}
function setCookie(res,token,maxAge){res.setHeader('Set-Cookie',COOKIE+'='+token+'; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge)}
module.exports={COOKIE,lifetime,eq,isAuthorized,sameOrigin,setCookie,secret};
