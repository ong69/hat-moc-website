const crypto=require('crypto');
const eq=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!['GET','POST','PATCH','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!process.env.HATMOC_ADMIN_PASSWORD||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:'Dashboard setup incomplete'});
 if(!eq((req.headers.authorization||'').replace(/^Bearer\s+/i,''),process.env.HATMOC_ADMIN_PASSWORD))return res.status(401).json({error:'Incorrect password'});
 const url=process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/hatmoc_ebay_sales';
 const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 try{
  if(req.method==='GET'){
   const r=await fetch(url+'?select=*&order=sale_date.desc&limit=1000',{headers,signal:AbortSignal.timeout(8000)});
   if(!r.ok)return res.status(503).json({error:'eBay sales table unavailable. Run supabase-ebay-sales.sql in Supabase first.'});
   return res.status(200).json({sales:await r.json()});
  }
  const body=req.body||{},order_id=String(body.order_id||'').trim();
  if(!/^[a-zA-Z0-9-]{5,64}$/.test(order_id))return res.status(400).json({error:'Enter a valid eBay order number'});
  const target=url+'?order_id=eq.'+encodeURIComponent(order_id);
  if(req.method==='DELETE'){
   if(body.confirmation!==order_id)return res.status(400).json({error:'Order reference confirmation required'});
   const r=await fetch(target,{method:'DELETE',headers:{...headers,Prefer:'return=representation'},signal:AbortSignal.timeout(8000)});
   if(!r.ok)return res.status(502).json({error:'Could not delete eBay sale'});
   return res.status(200).json({ok:true});
  }
  if(req.method==='PATCH'){
   if(!['awaiting_payment','paid','fulfilled','cancelled'].includes(body.status))return res.status(400).json({error:'Invalid status'});
   const r=await fetch(target,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({status:body.status}),signal:AbortSignal.timeout(8000)});
   if(!r.ok)return res.status(502).json({error:'Could not update eBay sale'});
   return res.status(200).json({ok:true});
  }
  const product=String(body.product||'').trim(),quantity=Number(body.quantity),total=Number(body.total),sale_date=String(body.sale_date||'');
  if(product.length<2||product.length>120||!Number.isInteger(quantity)||quantity<1||quantity>999||!Number.isFinite(total)||total<0||total>100000||!/^\d{4}-\d{2}-\d{2}$/.test(sale_date)||Number.isNaN(Date.parse(sale_date))||!['awaiting_payment','paid','fulfilled','cancelled'].includes(body.status))return res.status(400).json({error:'Check the sale details'});
  const r=await fetch(url,{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({order_id,product,quantity,total,sale_date,status:body.status}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)return res.status(502).json({error:'Could not save eBay sale. Check Supabase setup.'});
  const rows=await r.json();if(!rows.length)return res.status(409).json({error:'This eBay order number is already recorded'});
  return res.status(201).json({ok:true});
 }catch(e){return res.status(502).json({error:'Unable to reach database'})}
};