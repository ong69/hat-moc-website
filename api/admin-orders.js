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
  const productNames={coffee:'Hanoi Robusta coffee beans · 500g',cashew150:'Vietnamese roasted cashews · 150g',cashew300:'Vietnamese roasted cashews · 300g',cashew500:'Vietnamese roasted cashews · 500g',bundle:'Hanoi coffee & cashews bundle'};
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const products=(Array.isArray(order.items)?order.items:[]).map(i=>({name:productNames[i.id]||i.id,qty:Number(i.qty)||1}));
  const delivery=order.delivery_method==='pickup'?'Free pickup · Bankstown NSW':order.delivery_method==='local'?'Free local delivery':'Australia Post delivery';
  const next=order.delivery_method==='pickup'?'We will contact you to arrange a convenient pickup time in Bankstown.':order.delivery_method==='local'?'We will contact you to arrange your local delivery.':'We aim to dispatch within 2 business days after payment verification. Australia Post delivery time is additional.';
  const productText=products.map(i=>i.name+' × '+i.qty).join('\n');
  const message=['HẠT MỘC — PAYMENT CONFIRMED','','Hi '+order.customer_name+',','','Thank you for your order. We have received and verified your payment.','','Order reference: '+reference,'','YOUR ORDER',productText,'','Total paid: '+order.total,'Delivery: '+delivery,order.destination?'Postcode / destination: '+order.destination:'','','WHAT HAPPENS NEXT',next,'','If you have any questions, reply to this email.','','Hạt Mộc — The Raw Taste','www.hatmoc.com'].join('\n');
  const productRows=products.map(i=>'<tr><td style="padding:13px 0;border-bottom:1px solid #e8ebe5;font-size:14px;color:#163d2c">'+safe(i.name)+'</td><td align="right" style="padding:13px 0;border-bottom:1px solid #e8ebe5;font-size:14px;color:#163d2c;white-space:nowrap">Qty '+safe(i.qty)+'</td></tr>').join('');
  const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:28px 12px;background:#f5f4ef;font-family:Arial,Helvetica,sans-serif;color:#173b2c"><table role="presentation" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-collapse:collapse"><tr><td style="background:#103d2b;padding:28px 30px;text-align:center"><div style="font-size:24px;letter-spacing:1px;font-weight:700;color:#f3d68d">HẠT MỘC</div><div style="margin-top:7px;font-size:12px;letter-spacing:2px;color:#e8e4d6">THE RAW TASTE</div></td></tr><tr><td style="padding:34px 30px"><div style="font-size:12px;font-weight:700;letter-spacing:1.3px;color:#607467">ORDER UPDATE</div><h1 style="font-size:26px;line-height:1.2;color:#103d2b;margin:11px 0 16px">Payment confirmed</h1><p style="font-size:15px;line-height:1.7;margin:0 0 14px">Hi '+safe(order.customer_name)+',</p><p style="font-size:15px;line-height:1.7;margin:0 0 24px">Thank you for your order. We have received and verified your payment. Your Hạt Mộc order is now being prepared for the next step.</p><div style="padding:16px 18px;background:#f6f4ed;border-left:3px solid #c5a75b;margin-bottom:28px"><div style="font-size:12px;color:#637266">ORDER REFERENCE</div><div style="font-size:17px;font-weight:700;color:#123c2c;margin-top:5px">'+safe(reference)+'</div></div><h2 style="font-size:17px;color:#103d2b;margin:0 0 10px">Your order</h2><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">'+productRows+'</table><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:18px"><tr><td style="padding:12px 0;font-size:14px;color:#5b6e61">Total paid</td><td align="right" style="font-size:20px;font-weight:700;color:#103d2b">'+safe(order.total)+'</td></tr><tr><td style="padding:10px 0;font-size:14px;color:#5b6e61">Delivery method</td><td align="right" style="font-size:14px;color:#103d2b">'+safe(delivery)+'</td></tr>'+(order.destination?'<tr><td style="padding:10px 0;font-size:14px;color:#5b6e61">Destination</td><td align="right" style="font-size:14px;color:#103d2b">'+safe(order.destination)+'</td></tr>':'')+'</table><div style="background:#f4f7f3;padding:19px 20px;margin:25px 0 22px"><h2 style="font-size:16px;color:#103d2b;margin:0 0 8px">What happens next?</h2><p style="font-size:14px;line-height:1.7;margin:0">'+safe(next)+'</p></div><p style="font-size:14px;line-height:1.7;margin:0 0 15px">Questions about your order? Simply reply to this email.</p><p style="font-size:14px;line-height:1.7;margin:0">Thank you,<br><strong>Hạt Mộc</strong></p></td></tr><tr><td style="padding:20px;text-align:center;background:#103d2b"><a href="https://www.hatmoc.com" style="color:#f3d68d;text-decoration:none;font-size:13px">www.hatmoc.com</a></td></tr></table></body></html>';
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[order.customer_email],reply_to:'orders@hatmoc.com',subject:'Payment received — Hạt Mộc order '+reference,text:message,html}),signal:AbortSignal.timeout(10000)});
  if(!sent.ok)return json(res,502,{error:'Payment marked paid but confirmation email failed. You can retry.'});
  await fetch(base+'?reference=eq.'+encodeURIComponent(reference),{method:'PATCH',headers,body:JSON.stringify({confirmation_sent_at:new Date().toISOString()})});
 }
 return json(res,200,{ok:true});
 }catch(e){return json(res,502,{error:'Unable to complete request. Please try again.'})}
};
