const crypto=require('crypto');
const allowed=['awaiting_quote','awaiting_payment','payment_claimed','paid','fulfilled'];
const json=(res,status,data)=>res.status(status).json(data);
const eq=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Method not allowed'});
 if(!process.env.HATMOC_ADMIN_PASSWORD||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return json(res,503,{error:'Dashboard setup incomplete. Configure private Vercel environment variables.'});
 if(!eq((req.headers.authorization||'').replace(/^Bearer\s+/i,''),process.env.HATMOC_ADMIN_PASSWORD))return json(res,401,{error:'Incorrect password'});
 const base=process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/hatmoc_orders';
 const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 try{
 if(req.method==='GET'){
  const r=await fetch(base+'?select=reference,created_at,customer_name,customer_email,items,total,delivery_method,destination,payment_ready,status,payment_confirmed_at,confirmation_sent_at&order=created_at.desc&limit=100',{headers,signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('Database error');
  return json(res,200,{orders:await r.json()});
 }
 const {reference,status,sendConfirmation}=req.body||{};
 if(!/^HM-[A-Z0-9]{4,12}$/.test(reference||'')||!allowed.includes(status))return json(res,400,{error:'Invalid order or status'});
 const read=await fetch(base+'?reference=eq.'+encodeURIComponent(reference)+'&select=*',{headers,signal:AbortSignal.timeout(8000)});
 if(!read.ok)throw Error('Database error');const [order]=await read.json();if(!order)return json(res,404,{error:'Order not found'});
 if(sendConfirmation&&status!=='paid')return json(res,400,{error:'Confirm bank payment before emailing'});
 if(sendConfirmation&&(!order.payment_ready||order.confirmation_sent_at))return json(res,409,{error:'Payment not ready or confirmation already sent'});
 const patch={status};if(status==='paid'&&!order.payment_confirmed_at)patch.payment_confirmed_at=new Date().toISOString();
 // Record confirmed payment before attempting to email. A failed email can be retried.
 const upd=await fetch(base+'?reference=eq.'+encodeURIComponent(reference),{method:'PATCH',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify(patch),signal:AbortSignal.timeout(8000)});
 if(!upd.ok)throw Error('Could not update order');
 if(sendConfirmation){
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return json(res,503,{error:'Resend not configured; order marked paid, email not sent'});
  const message='Hi '+order.customer_name+',\n\nWe have received and verified payment for your Hạt Mộc order '+reference+'. Thank you!\n\nWe will arrange dispatch, pickup or local delivery within 2 business days. Postal transit time is additional.\n\nQuestions? Reply to this email.\n\nHạt Mộc\nwww.hatmoc.com';
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[order.customer_email],reply_to:'orders@hatmoc.com',subject:'Payment confirmed | Hạt Mộc '+reference,text:message}),signal:AbortSignal.timeout(10000)});
  if(!sent.ok)return json(res,502,{error:'Payment marked paid but confirmation email failed. You can retry.'});
  await fetch(base+'?reference=eq.'+encodeURIComponent(reference),{method:'PATCH',headers,body:JSON.stringify({confirmation_sent_at:new Date().toISOString()})});
 }
 return json(res,200,{ok:true});
 }catch(e){return json(res,502,{error:'Unable to complete request. Please try again.'})}
};
