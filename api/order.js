// Secure order enquiry delivery via Resend. Configure RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel.
// No payment is taken and postage is never represented as a final charge.
const prices={coffee:24.9,cashew150:5.5,cashew300:10.5,cashew500:16.9,bundle:39.9};
const names={coffee:'Hanoi coffee beans 500g',cashew150:'Roasted cashews 150g',cashew300:'Roasted cashews 300g',cashew500:'Roasted cashews 500g',bundle:'Coffee + cashews bundle'};
const money=n=>'$'+n.toFixed(2);
const clean=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const {quoteCart}=require('./postage');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(Number(req.headers['content-length']||0)>12000)return res.status(413).json({error:'Request too large'});
 const body=req.body||{};
 if(body.website)return res.status(200).json({ok:true});
 const name=clean(body.name,100),email=clean(body.email,160),phone=clean(body.phone,40),method=clean(body.method,20),destination=clean(body.destination,150),address=clean(body.address,200),notes=clean(body.notes,500);
 if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||!phone||!['post','pickup','local'].includes(method)||method!=='pickup'&&(!/\d{4}/.test(destination)||address.length<6))return res.status(400).json({error:'Please complete your contact and delivery details.'});
 const items=body.cart;
 if(!Array.isArray(items)||items.length<1||items.length>5)return res.status(400).json({error:'Please add products to your order.'});
 let subtotal=0,totalBags=0;const lines=[];
 for(const item of items){if(!item||!Object.hasOwn(prices,item.id)||!Number.isInteger(item.qty)||item.qty<1||item.qty>30)return res.status(400).json({error:'Invalid product selection.'});subtotal+=prices[item.id]*item.qty;totalBags+=item.qty;lines.push(names[item.id]+' × '+item.qty+' — '+money(prices[item.id]*item.qty));}
 if(totalBags>100)return res.status(400).json({error:'Please contact us for a bulk order.'});
 subtotal=Number(subtotal.toFixed(2));
 // Never trust a browser-supplied postage price. Recalculate from the cart using Australia Post.
 let postageAmount=null;
 if(method==='post'){
  const pc=destination.match(/(\d{4})$/)?.[1];
  if(pc){try{postageAmount=await quoteCart(items,pc);}catch(e){postageAmount=null;}}
 }
 let localMinutes=null;
 if(method==='local'&&process.env.GOOGLE_MAPS_API_KEY){
  try{
   const rr=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_MAPS_API_KEY,'X-Goog-FieldMask':'routes.duration'},body:JSON.stringify({origin:{address:'61 Cairds Avenue, Bankstown NSW 2200, Australia'},destination:{address:address+', '+destination+', Australia'},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'}),signal:AbortSignal.timeout(9000)});
   if(rr.ok){const data=await rr.json();const seconds=Number(String(data.routes?.[0]?.duration||'').replace(/s$/,''));if(Number.isFinite(seconds)&&seconds>0)localMinutes=seconds/60;}
  }catch(e){}
 }
 const localFree=method==='local'&&localMinutes!==null&&localMinutes<=15;
 const pickup=method==='pickup',local=method==='local',postReady=method==='post'&&postageAmount!==null;
 const payable=pickup||postReady||localFree;
 const postage=pickup?'FREE pickup':localFree?'FREE local delivery ('+Math.ceil(localMinutes)+' min estimated drive)':local?'Local delivery eligibility not confirmed':postReady?money(postageAmount)+' Australia Post Parcel Post estimate':'Awaiting packing and postage confirmation';
 const total=payable?money(subtotal+(postReady?postageAmount:0)):'Pending delivery confirmation';
 const ref='HM-'+Date.now().toString(36).toUpperCase().slice(-8);
 const fields=[['Reference',ref],['Customer',name],['Email',email],['Phone',phone],['Items',lines.join('\n')],['Products subtotal',money(subtotal)],['Delivery method',pickup?'Free Bankstown pickup':localFree?'Free local delivery':local?'Local delivery eligibility check':'Australia-wide shipping'],['Destination',pickup?'Bankstown pickup':address+', '+destination],['Postage / delivery',postage],['Total',total],['Notes',notes||'None']];
 const plain='New Hạt Mộc customer order\n\n'+fields.map(([k,v])=>k+': '+v).join('\n')+'\n\nPayment must be checked in St.George before fulfilment.';
 const html='<div style="font-family:Arial,sans-serif;max-width:560px;color:#123c2b"><div style="background:#103d2b;color:#f5d78d;padding:20px"><h2 style="margin:0">Hạt Mộc · New order</h2></div><div style="padding:18px;border:1px solid #e7dfcc"><p><b>Order reference: '+escape(ref)+'</b></p>'+fields.slice(1).map(([k,v])=>'<p style="border-bottom:1px solid #eee;padding-bottom:9px"><b>'+escape(k)+'</b><br>'+escape(v).replace(/\n/g,'<br>')+'</p>').join('')+'<p><b>Check funds in St.George before pickup or dispatch.</b></p></div></div>';
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
 if(!apiKey||!from)return res.status(503).json({error:'Online order submissions are not enabled yet. Please message us directly.'});
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:['nick_ong@outlook.com'],reply_to:email,subject:'Hạt Mộc | NEW ORDER '+ref+' — '+name,text:plain,html}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return res.status(502).json({error:'Unable to deliver your order right now. Please try again or contact us directly.'});
  // One customer email; a separate internal notification goes to the owner.
  const payText='PayID: 0434 085 355\nOr bank transfer:\nAccount name: Nicholas Ong\nBSB: 112-879\nAccount number: 443678902\nPayment reference: '+ref;
  const paymentInstructions=payable
    ? 'Amount to pay: '+total+'\n'+payText+'\n\nAfter paying, reply to this email with a screenshot or payment confirmation and include your order reference. We will check the funds in St.George before preparing your order.'
    : local?'Free local delivery applies only to addresses confirmed within approximately 15 minutes driving of Bankstown. We will check your address and send the final amount and payment instructions. Please do not pay yet.'
    :'Your parcel requires a packing/postage check. We will send the final total and payment details once confirmed. Please do not pay yet.';
  const deliveryText=pickup?'Free Bankstown pickup':localFree?'Free local delivery':local?'Local delivery — eligibility to be confirmed':'Australia Post Parcel Post';
  const nextStep=pickup?'We will arrange your Bankstown pickup after payment clears.':localFree?'After payment clears, we will contact you to arrange free local delivery.':local?'We will confirm your delivery eligibility and timing, then arrange delivery after payment clears.':'Once payment clears, we aim to dispatch within 2 business days. Australia Post transit time is additional.';
  const customerText='HẠT MỘC — YOUR ORDER\nOrder '+ref+'\n\nHi '+name+',\n\nThank you for your order! Here is your summary.\n\n'+lines.join('\n')+'\n\nProducts: '+money(subtotal)+'\nDelivery: '+deliveryText+'\nDestination: '+(pickup?'Bankstown pickup':address+', '+destination)+'\nPostage: '+postage+'\nTotal: '+total+'\n\nPAYMENT\n'+paymentInstructions+'\n\n'+nextStep+'\n\nPlease note: Product availability is subject to confirmation. A payment screenshot does not confirm cleared funds.\n\nQuestions? Reply to this email.\nHạt Mộc — The Raw Taste\nwww.hatmoc.com';
  const rows=lines.map(x=>'<tr><td style="padding:10px 0;border-bottom:1px solid #e8e3d7">'+escape(x)+'</td></tr>').join('');
  const payHtml=payable
    ? '<p style="font-size:20px;margin:8px 0 16px"><b>Amount to pay: '+escape(total)+'</b></p><p><b>PayID:</b> 0434 085 355</p><p><b>Bank transfer</b><br>Account name: Nicholas Ong<br>BSB: 112-879<br>Account number: 443678902</p><p><b>Payment reference:</b> '+escape(ref)+'</p><p style="font-size:13px;line-height:1.6">Once paid, <b>reply to this email</b> with a screenshot or payment confirmation and your order reference. We will check that funds have arrived before preparing your order.</p>'
    : '<p>'+escape(paymentInstructions)+'</p>';
  const customerHtml='<!doctype html><html><body style="margin:0;background:#f6f4ed;font-family:Arial,Helvetica,sans-serif;color:#123b2b"><div style="max-width:580px;margin:24px auto;background:white;border:1px solid #e5dfd1"><div style="background:#103d2b;color:#f5d78d;padding:27px;text-align:center"><div style="font-size:29px;font-weight:bold">Hạt Mộc</div><div style="font-size:11px;letter-spacing:3px">THE RAW TASTE</div></div><div style="padding:28px"><h1 style="font-size:23px;margin:0 0 8px">Thank you for your order!</h1><p style="color:#617568;font-size:13px">Order '+escape(ref)+'</p><p>Hi '+escape(name)+',</p><p>Here is your order summary.</p><table style="width:100%;border-collapse:collapse;margin:20px 0">'+rows+'</table><table style="width:100%;font-size:14px;line-height:1.8"><tr><td>Products</td><td style="text-align:right"><b>'+escape(money(subtotal))+'</b></td></tr><tr><td>Delivery</td><td style="text-align:right">'+escape(deliveryText)+'</td></tr><tr><td>Postage / delivery</td><td style="text-align:right">'+escape(postage)+'</td></tr><tr><td style="border-top:1px solid #ddd;padding-top:8px"><b>Total</b></td><td style="text-align:right;border-top:1px solid #ddd;padding-top:8px"><b>'+escape(total)+'</b></td></tr></table><p style="font-size:13px;color:#536b5c">Destination: '+escape(pickup?'Bankstown pickup':address+', '+destination)+'</p><div style="background:#f8f3e6;border-left:4px solid #c5a45b;padding:18px;margin:22px 0"><h2 style="font-size:17px;margin:0 0 12px">Payment & next steps</h2>'+payHtml+'</div><p style="line-height:1.6">'+escape(nextStep)+'</p><p style="font-size:12px;color:#637568">Product availability is subject to confirmation. Payment screenshots do not replace verification of cleared funds.</p><p>Questions? Just reply to this email.</p><p style="margin-top:24px">Thank you for supporting Hạt Mộc.</p></div><div style="background:#103d2b;color:#f5d78d;text-align:center;padding:18px;font-size:13px">Hạt Mộc · The Raw Taste<br><a href="https://www.hatmoc.com" style="color:#f5d78d;text-decoration:none">www.hatmoc.com</a></div></div></body></html>';
  let acknowledgementSent=false;
  try{
   const customerResponse=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],reply_to:'nick_ong@outlook.com',subject:'Hạt Mộc | Order confirmation '+ref,text:customerText,html:customerHtml}),signal:AbortSignal.timeout(10000)});
   acknowledgementSent=customerResponse.ok;
  }catch(e){/* Owner already received the order; avoid duplicate submissions. */}
  return res.status(200).json({ok:true,acknowledgementSent});
 }catch(e){return res.status(502).json({error:'Unable to deliver your order right now. Please try again.'});}
};
