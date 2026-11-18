// Server-side Australia Post PAC quote. Requires AUSPOST_API_KEY in Vercel.
const products={
 coffee:{price:24.9,grams:500,h:25,w:15,d:8},
 cashew150:{price:5.5,grams:150,h:19,w:11,d:6},
 cashew300:{price:10.5,grams:300,h:21,w:13,d:8},
 cashew500:{price:16.9,grams:500,h:16,w:10,d:5},
 bundle:{price:39.9,grams:1000,h:25,w:15,d:13}
};
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const {product,quantity,postcode}=req.query||{};
 const n=Number(quantity);
 if(!products[product]||!Number.isInteger(n)||n<1||n>30||!/^[0-9]{4}$/.test(String(postcode||'')))return res.status(400).json({error:'Choose a valid product, quantity and Australian postcode.'});
 const item=products[product];
 // Bag dimensions are measured by the seller; package size and weight are conservative estimates.
 // Stacking can be different in a flexible satchel; do not claim a prepaid satchel fit.
 const weight=Number(((item.grams*n+100)/1000).toFixed(3));
 if(weight>5)return res.status(422).json({error:'This order may require multiple satchels. Please request a manual postage quote.'});
 const dims=[item.h,item.w,item.d*n+2].sort((a,b)=>b-a);
 if(dims[0]>100||dims[1]>70||dims[2]>70)return res.status(422).json({error:'This order requires a packing check. Please request a manual quote.'});
 const key=process.env.AUSPOST_API_KEY;
 if(!key)return res.status(503).json({error:'Live Australia Post postage is not enabled yet. Please request a postage quote.'});
 const params=new URLSearchParams({from_postcode:process.env.AUSPOST_FROM_POSTCODE||'2200',to_postcode:postcode,length:String(dims[0]),width:String(dims[1]),height:String(dims[2]),weight:String(weight)});
 try{
  const response=await fetch('https://digitalapi.auspost.com.au/postage/parcel/domestic/service.json?'+params,{headers:{'AUTH-KEY':key},signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok)return res.status(502).json({error:'Australia Post rates are temporarily unavailable. Please request a postage quote.'});
  const raw=data?.services?.service;
  const services=Array.isArray(raw)?raw:raw?[raw]:[];
  const regular=services.find(s=>s.code==='AUS_PARCEL_REGULAR');
  const amount=Number(regular?.price);
  if(!Number.isFinite(amount)||amount<0)return res.status(502).json({error:'No standard Parcel Post rate was returned. Please request a quote.'});
  return res.status(200).json({postage:amount,subtotal:Number((item.price*n).toFixed(2)),total:Number((item.price*n+amount).toFixed(2)),service:'Australia Post Parcel Post',estimated:true,notice:'Indicative rate using estimated packed weight and dimensions. Prepaid satchel fit and final postage must be confirmed before payment.'});
 }catch(e){return res.status(502).json({error:'Australia Post is unavailable. Please request a postage quote.'});}
};