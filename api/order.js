// Secure order enquiry delivery via Resend. Configure RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel.
// No payment is taken and postage is never represented as a final charge.
const prices={coffee300:16.9,coffee:24.9,cashew150:5.5,cashew300:10.5,cashew500:16.9,bundle:39.9};
const names={coffee300:'Hanoi coffee beans 300g',coffee:'Hanoi coffee beans 500g',cashew150:'Roasted cashews 150g',cashew300:'Roasted cashews 300g',cashew500:'Roasted cashews 500g',bundle:'Coffee + cashews bundle'};
const money=n=>'$'+n.toFixed(2);
const clean=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const {quoteCart}=require('./postage');
const deliveryZones=require('../delivery-zones.json');
const isApprovedLocal=(destination)=>{const m=String(destination).trim().match(/^(.+?),?\s*(?:NSW\s+)?(\d{4})$/i);if(!m)return false;const suburb=m[1].replace(/,\s*NSW$/i,'').trim().toLowerCase();return deliveryZones.approvedSuburbs.some(z=>z.suburb.toLowerCase()===suburb&&z.postcode===m[2]);};
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
 const localFree=method==='local'&&isApprovedLocal(destination);
 if(method==='local'&&!localFree)return res.status(400).json({error:'Free local delivery is not available for that suburb. Please select an approved suburb, free Bankstown pickup or Australia-wide postage.'});
 const pickup=method==='pickup',local=method==='local',postReady=method==='post'&&postageAmount!==null;
 const fixedCoffee=postReady&&items.length===1&&['coffee300','coffee','cashew150','cashew300','cashew500','bundle'].includes(items[0].id)&&items[0].qty===1;
 const payable=pickup||postReady||localFree;
 const postage=pickup?'FREE pickup':localFree?'FREE local delivery (approved suburb)':local?'Local delivery eligibility not confirmed':postReady?money(postageAmount)+(fixedCoffee?' MyPost Business Parcel Post fixed':' Australia Post Parcel Post estimate'):'Awaiting packing and postage confirmation';
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
    : local?'Free local delivery applies only to addresses in approved delivery suburbs. We will check your address and send the final amount and payment instructions. Please do not pay yet.'
    :'Your parcel requires a packing/postage check. We will send the final total and payment details once confirmed. Please do not pay yet.';
  const deliveryText=pickup?'Free Bankstown pickup':localFree?'Free local delivery':local?'Local delivery — eligibility to be confirmed':'Australia Post Parcel Post';
  const nextStep=pickup?'We will arrange your Bankstown pickup after payment clears.':localFree?'After payment clears, we will contact you to arrange free local delivery in our approved service area.':local?'We will confirm your delivery eligibility and timing, then arrange delivery after payment clears.':'Once payment clears, we aim to dispatch within 2 business days. Australia Post transit time is additional.';
  const customerText='HẠT MỘC — YOUR ORDER\nOrder '+ref+'\n\nHi '+name+',\n\nThank you for your order! Here is your summary.\n\n'+lines.join('\n')+'\n\nProducts: '+money(subtotal)+'\nDelivery: '+deliveryText+'\nDestination: '+(pickup?'Bankstown pickup':address+', '+destination)+'\nPostage: '+postage+'\nTotal: '+total+'\n\nPAYMENT\n'+paymentInstructions+'\n\n'+nextStep+'\n\nPlease note: Product availability is subject to confirmation. A payment screenshot does not confirm cleared funds.\n\nQuestions? Reply to this email.\nHạt Mộc — The Raw Taste\nwww.hatmoc.com';
  const rows=lines.map(x=>'<tr><td style="padding:12px 0;border-bottom:1px solid #e9e7df;font-size:15px;line-height:1.5">'+escape(x)+'</td></tr>').join('');
  const detailRow=(label,value,bold=false)=>'<tr><td style="padding:7px 0;color:#607268;font-size:14px;vertical-align:top">'+label+'</td><td style="padding:7px 0;text-align:right;color:#143c2d;font-size:14px;vertical-align:top;'+(bold?'font-weight:700;':'')+'">'+escape(value)+'</td></tr>';
  const intro='Thank you for choosing Hạt Mộc. We appreciate your order of coffee and cashews sourced from Hanoi, Vietnam.';
  const paymentRows=payable
    ? '<p style="margin:0 0 3px;font-size:12px;font-weight:700;letter-spacing:1px;color:#65776a">TOTAL TO PAY</p><p style="margin:0 0 18px;font-size:29px;line-height:1.2;font-weight:700;color:#103d2b">'+escape(total)+'</p>'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.75;color:#173b2d"><tr><td width="43%" style="padding:12px 12px 13px 0;border-top:1px solid #dedccf;vertical-align:top"><b style="color:#103d2b">PayID</b><br>0434 085 355</td><td style="padding:12px 0 13px;border-top:1px solid #dedccf;vertical-align:top"><b style="color:#103d2b">Bank transfer</b><br>Nicholas Ong<br>BSB: 112-879<br>Account: 443678902</td></tr></table>'+
      '<p style="border-top:1px solid #dedccf;padding:13px 0 0;margin:0;font-size:14px;line-height:1.6;color:#173b2d"><b>Payment reference</b><br><span style="font-weight:700;letter-spacing:.3px">'+escape(ref)+'</span></p>'
    : '<p style="margin:0;font-size:14px;line-height:1.7">'+escape(paymentInstructions)+'</p>';
  const actionHtml=payable
    ? '<div style="background:#eaf3eb;border-left:4px solid #2e7450;padding:16px 18px;margin:0 0 22px"><p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#103d2b">What to do next</p><p style="margin:0 0 7px;font-size:14px;line-height:1.65"><b>1.</b> Pay '+escape(total)+' using the payment details above. Use <b>'+escape(ref)+'</b> as your payment reference.</p><p style="margin:0 0 7px;font-size:14px;line-height:1.65"><b>2.</b> Reply to this email with a screenshot or payment confirmation.</p><p style="margin:0;font-size:14px;line-height:1.65"><b>3.</b> We’ll verify your payment, then arrange your order.</p></div>'
    : '<div style="background:#eaf3eb;border-left:4px solid #2e7450;padding:16px 18px;margin:0 0 22px"><p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#103d2b">What to do next</p><p style="margin:0;font-size:14px;line-height:1.7">No payment needed yet. We’ll confirm your final delivery or postage details and email you the amount to pay.</p></div>';
  const customerHtml='<!doctype html><html><body style="margin:0;padding:20px 12px;background:#f4f2ec;font-family:Arial,Helvetica,sans-serif;color:#173b2d;-webkit-text-size-adjust:100%"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #e6e4db;border-collapse:separate;border-spacing:0"><tr><td style="padding:24px;text-align:center;background:#103d2b;color:#efd18b"><div style="font-family:Georgia,serif;font-size:30px;font-weight:700">Hạt Mộc</div><div style="font-size:10px;letter-spacing:2.5px;margin-top:3px">THE RAW TASTE</div></td></tr><tr><td style="padding:28px 26px"><h1 style="font-family:Georgia,serif;font-size:25px;line-height:1.3;margin:0 0 12px;color:#103d2b">Thank you for your order!</h1><p style="margin:0 0 8px;font-size:14px;line-height:1.6">Hi '+escape(name)+',</p><p style="margin:0 0 17px;font-size:14px;line-height:1.65">'+intro+'</p><p style="background:#f5f5f0;padding:11px 13px;margin:0 0 22px;font-size:13px;line-height:1.5"><b>Order received</b> &nbsp;·&nbsp; '+escape(ref)+'</p>'+'<div style="background:#f8f4e9;border:1px solid #e5ddc9;padding:22px 20px;margin:0 0 20px"><h2 style="font-size:16px;margin:0 0 16px;color:#103d2b">'+(payable?'Payment details':'Awaiting final quote')+'</h2>'+paymentRows+'</div>'+actionHtml+'<h2 style="font-size:16px;margin:0 0 8px;color:#103d2b">Your order summary</h2><table role="presentation" width="100%" style="border-collapse:collapse">'+rows+'</table><table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0">'+detailRow('Products',money(subtotal))+detailRow('Delivery method',deliveryText)+detailRow('Postage / delivery',postage)+'</table><table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #d8dfd8;margin:8px 0 14px"><tr><td style="padding:14px 0;font-size:16px;font-weight:700">'+(payable?'Total to pay':'Estimated total')+'</td><td style="padding:14px 0;text-align:right;font-size:19px;font-weight:700;color:#103d2b">'+escape(total)+'</td></tr></table><p style="font-size:14px;color:#4b6053;line-height:1.65;margin:0 0 17px">'+escape(pickup?'Pickup: Bankstown, NSW':'Delivery to: '+address+', '+destination)+'</p><p style="font-size:14px;line-height:1.65;color:#173b2d;margin:0 0 13px">'+escape(nextStep)+'</p><p style="font-size:13px;line-height:1.65;color:#64746a;margin:0 0 20px">We verify payment before preparing your order. Product availability is subject to confirmation.</p><p style="border-top:1px solid #e6e9e2;padding-top:17px;font-size:14px;line-height:1.7;margin:0;color:#173b2d">Questions about your order? Reply to this email.<br><br>Thank you,<br><b>Hạt Mộc</b></p></td></tr><tr><td style="background:#103d2b;padding:17px;text-align:center;font-size:12px;color:#efd18b"><a href="https://www.hatmoc.com" style="color:#efd18b;text-decoration:none">www.hatmoc.com</a></td></tr></table></body></html>';
  let acknowledgementSent=false;
  try{
   const customerResponse=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],reply_to:'nick_ong@outlook.com',subject:'Hạt Mộc | Order confirmation '+ref,text:customerText,html:customerHtml}),signal:AbortSignal.timeout(10000)});
   acknowledgementSent=customerResponse.ok;
  }catch(e){/* Owner already received the order; avoid duplicate submissions. */}
  // Optional private order tracking. Existing email checkout still works if storage is not configured.
  if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
   try{
    const base=process.env.SUPABASE_URL.trim().split('?')[0].replace(new RegExp('/+$'),'')+'/rest/v1/hatmoc_orders';
    await fetch(base,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({reference:ref,customer_name:name,customer_email:email,customer_phone:phone,items,total,delivery_method:method,destination,address,payment_ready:payable,status:payable?'awaiting_payment':'awaiting_quote'}),signal:AbortSignal.timeout(8000)});
   }catch(e){console.error('Optional order tracking unavailable',e.message);}
  }
  return res.status(200).json({ok:true,acknowledgementSent,reference:ref,paymentReady:payable,deliveryMethod:method});
 }catch(e){return res.status(502).json({error:'Unable to deliver your order right now. Please try again.'});}
};
