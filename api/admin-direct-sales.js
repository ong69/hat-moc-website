const {isAuthorized,sameOrigin}=require('./_admin-auth');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!['GET','POST','PATCH','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!process.env.HATMOC_ADMIN_PASSWORD||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:'Dashboard setup incomplete'});
 if(!isAuthorized(req))return res.status(401).json({error:'Incorrect password'});
 if(!sameOrigin(req))return res.status(403).json({error:'Invalid request origin'});
 const url=process.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/hatmoc_direct_sales';
 const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 try{
  if(req.method==='GET'){
   const r=await fetch(url+'?select=*&order=sale_date.desc&limit=1000',{headers,signal:AbortSignal.timeout(8000)});
   if(!r.ok)return res.status(503).json({error:'direct sales table unavailable. Run supabase-direct-sales.sql in Supabase first.'});
   return res.status(200).json({sales:await r.json()});
  }
  const body=req.body||{},sale_id=String(body.sale_id||'').trim();
  if(!/^[a-zA-Z0-9-]{5,64}$/.test(sale_id))return res.status(400).json({error:'Enter a valid direct order number'});
  const target=url+'?sale_id=eq.'+encodeURIComponent(sale_id);
  if(req.method==='DELETE'){
   if(body.confirmation!==sale_id)return res.status(400).json({error:'Order reference confirmation required'});
   const r=await fetch(target,{method:'DELETE',headers:{...headers,Prefer:'return=representation'},signal:AbortSignal.timeout(8000)});
   if(!r.ok)return res.status(502).json({error:'Could not delete direct sale'});
   return res.status(200).json({ok:true});
  }
  if(req.method==='PATCH'){
   if(!['awaiting_payment','paid','fulfilled','cancelled'].includes(body.status))return res.status(400).json({error:'Invalid status'});
   const changes={status:body.status}; if(body.source!==undefined){if(!['Facebook / Instagram','Friends & family','Local pickup / in-person','Markets / stalls','Other'].includes(body.source))return res.status(400).json({error:'Invalid sales source'});changes.source=body.source;}
   if(body.product!==undefined||body.quantity!==undefined||body.total!==undefined||body.sale_date!==undefined){
    const product=String(body.product||'').trim(),quantity=Number(body.quantity),total=Number(body.total),sale_date=String(body.sale_date||'');
    if(product.length<2||product.length>120||!Number.isInteger(quantity)||quantity<1||quantity>999||!Number.isFinite(total)||total<0||total>100000||!/^\d{4}-\d{2}-\d{2}$/.test(sale_date)||Number.isNaN(Date.parse(sale_date)))return res.status(400).json({error:'Check the edited sale details'});
    Object.assign(changes,{product,quantity,total,sale_date});
   }
   const r=await fetch(target,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(changes),signal:AbortSignal.timeout(8000)});
   if(!r.ok)return res.status(502).json({error:'Could not update direct sale'});
   const updated=await r.json();if(updated.length!==1)return res.status(404).json({error:'direct order not found'});
   return res.status(200).json({ok:true});
  }
  const product=String(body.product||'').trim(),quantity=Number(body.quantity),total=Number(body.total),sale_date=String(body.sale_date||'');
  if(!['Facebook / Instagram','Friends & family','Local pickup / in-person','Markets / stalls','Other'].includes(body.source))return res.status(400).json({error:'Choose a sales source'});
  if(product.length<2||product.length>120||!Number.isInteger(quantity)||quantity<1||quantity>999||!Number.isFinite(total)||total<0||total>100000||!/^\d{4}-\d{2}-\d{2}$/.test(sale_date)||Number.isNaN(Date.parse(sale_date))||!['awaiting_payment','paid','fulfilled','cancelled'].includes(body.status))return res.status(400).json({error:'Check the sale details'});
  const r=await fetch(url,{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({sale_id,product,quantity,total,sale_date,status:body.status,source:body.source}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)return res.status(502).json({error:'Could not save direct sale. Check Supabase setup.'});
  const rows=await r.json();if(!rows.length)return res.status(409).json({error:'This direct order number is already recorded'});
  return res.status(201).json({ok:true});
 }catch(e){return res.status(502).json({error:'Unable to reach database'})}
};