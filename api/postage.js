// Server-side Australia Post PAC quote. Requires AUSPOST_API_KEY in Vercel.
const products={
 coffee300:{price:16.9,grams:300,h:21,w:13,d:8},
 coffee:{price:24.9,grams:500,h:25,w:15,d:8},
 cashew150:{price:5.5,grams:150,h:19,w:11,d:6},
 cashew300:{price:10.5,grams:300,h:21,w:13,d:8},
 cashew500:{price:16.9,grams:500,h:16,w:10,d:5},
 bundle:{price:39.9,grams:1000,h:25,w:15,d:13}
};
// Verified MyPost Business customer quote for the tested single coffee parcel (0.6kg, 25x15x10cm).
// Do not extrapolate this account-specific rate to smaller bags or multi-item orders.
function verifiedCoffeeRate(items){if(!Array.isArray(items)||items.length!==1||items[0]?.qty!==1)return null;return items[0].id==='coffee300'?11.70:items[0].id==='coffee'?16.00:items[0].id==='cashew150'?10.20:items[0].id==='cashew300'?11.70:items[0].id==='cashew500'?16.00:items[0].id==='bundle'?20.25:null;}
async function quoteCart(items,postcode){
 if(!Array.isArray(items)||items.length<1||items.length>6||!/^[0-9]{4}$/.test(String(postcode||'')))throw Error('Invalid order or destination postcode');
 const fixed=verifiedCoffeeRate(items);if(fixed!==null)return fixed;
 const quantities={};
 for(const entry of items){if(!entry||!products[entry.id]||!Number.isInteger(entry.qty)||entry.qty<1||entry.qty>30)throw Error('Invalid product quantity');quantities[entry.id]=(quantities[entry.id]||0)+entry.qty;}
 const entries=Object.entries(quantities),bags=entries.reduce((n,[id,q])=>n+q*(id==='bundle'?2:1),0),grams=entries.reduce((n,[id,q])=>n+products[id].grams*q,0),weight=Number(((grams+100)/1000).toFixed(3));
 if(weight>5||bags>6)throw Error('This order needs a manual packing and postage quote');
 const dims=[Math.max(...entries.map(([id])=>products[id].h)),Math.max(...entries.map(([id])=>products[id].w)),entries.reduce((n,[id,q])=>n+products[id].d*q,0)+2].sort((a,b)=>b-a);
 if(dims[0]>100||dims[1]>70||dims[2]>70)throw Error('This order needs a manual packing check');
 if(!process.env.AUSPOST_API_KEY)throw Error('Australia Post is not configured');
 const params=new URLSearchParams({from_postcode:process.env.AUSPOST_FROM_POSTCODE||'2200',to_postcode:postcode,length:String(dims[0]),width:String(dims[1]),height:String(dims[2]),weight:String(weight)});
 const response=await fetch('https://digitalapi.auspost.com.au/postage/parcel/domestic/service.json?'+params,{headers:{'AUTH-KEY':process.env.AUSPOST_API_KEY},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Australia Post rate unavailable');
 const data=await response.json(),raw=data?.services?.service,services=Array.isArray(raw)?raw:raw?[raw]:[];
 const amount=Number(services.find(x=>x.code==='AUS_PARCEL_REGULAR')?.price);
 if(!Number.isFinite(amount)||amount<0)throw Error('No Parcel Post rate returned');
 return amount;
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const {product,quantity,postcode,cart}=req.query||{};
 let items;
 try{items=cart?JSON.parse(cart):[{id:product,qty:Number(quantity)}];}catch(e){return res.status(400).json({error:'Invalid cart.'});}
 if(!Array.isArray(items)||items.length<1||items.length>6||!/^[0-9]{4}$/.test(String(postcode||'')))return res.status(400).json({error:'Invalid items or postcode.'});
 const quantities={};
 for(const entry of items){if(!entry||!products[entry.id]||!Number.isInteger(entry.qty)||entry.qty<1||entry.qty>30)return res.status(400).json({error:'Invalid product or quantity.'});quantities[entry.id]=(quantities[entry.id]||0)+entry.qty;}
 const fixed=verifiedCoffeeRate(items);
 if(fixed!==null){const subtotal=products[items[0].id].price;return res.status(200).json({postage:fixed,subtotal,total:Number((subtotal+fixed).toFixed(2)),service:'MyPost Business Parcel Post',estimated:false,notice:'Fixed MyPost Business rate for this tested single-item parcel, subject to actual packed size.'});}
 const entries=Object.entries(quantities);
 const totalBags=entries.reduce((n,[id,qty])=>n+qty*(id==='bundle'?2:1),0);
 const subtotal=entries.reduce((n,[id,qty])=>n+products[id].price*qty,0);
 const grams=entries.reduce((n,[id,qty])=>n+products[id].grams*qty,0);
 const weight=Number(((grams+100)/1000).toFixed(3));
 if(weight>5||totalBags>6)return res.status(422).json({error:'Multiple bags or satchels may be required. Please request a manual postage quote.'});
 // Conservative single-parcel approximation, not a guaranteed satchel fit.
 const longest=Math.max(...entries.map(([id])=>products[id].h));
 const widest=Math.max(...entries.map(([id])=>products[id].w));
 const thickness=entries.reduce((n,[id,qty])=>n+products[id].d*qty,0)+2;
 const dims=[longest,widest,thickness].sort((a,b)=>b-a);
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
  return res.status(200).json({postage:amount,subtotal:Number(subtotal.toFixed(2)),total:Number((subtotal+amount).toFixed(2)),service:'Australia Post Parcel Post',estimated:true,notice:'Indicative rate using estimated packed weight and dimensions. Prepaid satchel fit and final postage must be confirmed before payment.'});
 }catch(e){return res.status(502).json({error:'Australia Post is unavailable. Please request a postage quote.'});}
};
module.exports.quoteCart=quoteCart;
