// Secure order enquiry delivery via Resend. Configure RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel.
// No payment is taken and postage is never represented as a final charge.
const prices={coffee:24.9,cashew150:5.5,cashew300:10.5,cashew500:16.9,bundle:39.9};
const names={coffee:'Hanoi coffee beans 500g',cashew150:'Roasted cashews 150g',cashew300:'Roasted cashews 300g',cashew500:'Roasted cashews 500g',bundle:'Coffee + cashews bundle'};
const money=n=>'$'+n.toFixed(2);
const clean=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(Number(req.headers['content-length']||0)>12000)return res.status(413).json({error:'Request too large'});
 const body=req.body||{};
 if(body.website)return res.status(200).json({ok:true});
 const name=clean(body.name,100),email=clean(body.email,160),phone=clean(body.phone,40),method=clean(body.method,20),destination=clean(body.destination,150),notes=clean(body.notes,500);
 if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||!phone||!['post','pickup','local'].includes(method)||method!=='pickup'&&!/\d{4}/.test(destination))return res.status(400).json({error:'Please complete your contact and delivery details.'});
 const items=body.cart;
 if(!Array.isArray(items)||items.length<1||items.length>5)return res.status(400).json({error:'Please add products to your order.'});
 let subtotal=0,totalBags=0;const lines=[];
 for(const item of items){if(!item||!Object.hasOwn(prices,item.id)||!Number.isInteger(item.qty)||item.qty<1||item.qty>30)return res.status(400).json({error:'Invalid product selection.'});subtotal+=prices[item.id]*item.qty;totalBags+=item.qty;lines.push(names[item.id]+' × '+item.qty+' — '+money(prices[item.id]*item.qty));}
 if(totalBags>100)return res.status(400).json({error:'Please contact us for a bulk order.'});
 subtotal=Number(subtotal.toFixed(2));
 // The customer-provided estimate is informational only; never trust it as a charged rate.
 const estimate=body.postageEstimate!==null&&body.postageEstimate!==undefined&&Number.isFinite(Number(body.postageEstimate))&&Number(body.postageEstimate)>=0&&Number(body.postageEstimate)<1000?Number(body.postageEstimate):null;
 const postage=method==='pickup'?'Free pickup':method==='local'?'Local delivery fee to be confirmed':estimate===null?'Postage to be confirmed':money(estimate)+' indicative (subject to packing confirmation)';
 const total=method==='pickup'?money(subtotal):method==='post'&&estimate!==null?money(subtotal+estimate)+' estimated':'To be confirmed';
 const fields=[['Customer',name],['Email',email],['Phone',phone],['Items',lines.join('\n')],['Product subtotal',money(subtotal)],['Delivery method',method==='post'?'Australia-wide shipping':method==='pickup'?'Free Bankstown pickup':'Local delivery by arrangement'],['Destination',method==='pickup'?'Bankstown pickup':destination],['Postage',postage],['Order total',total],['Notes',notes||'None']];
 const plain='New Hạt Mộc customer order\n\n'+fields.map(([k,v])=>k+': '+v).join('\n')+'\n\nConfirm availability, packing, final postage and payment with customer.';
 const html='<h2>New Hạt Mộc customer order</h2>'+fields.map(([k,v])=>'<p><strong>'+escape(k)+'</strong><br>'+escape(v).replace(/\n/g,'<br>')+'</p>').join('')+'<p>Confirm final postage and payment before fulfilment.</p>';
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
 if(!apiKey||!from)return res.status(503).json({error:'Online order submissions are not enabled yet. Please message us directly.'});
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:['nick_ong@outlook.com'],reply_to:email,subject:'Hạt Mộc NEW ORDER — '+name,text:plain,html}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return res.status(502).json({error:'Unable to deliver your order right now. Please try again or contact us directly.'});
  // One branded confirmation email to the customer; owner receives a separate internal order notification.
  // Only pickup has a known payable amount. Shipping/delivery require a confirmed final quote.
  const pickup=method==='pickup';
  const ref='HM-'+Date.now().toString(36).toUpperCase().slice(-8);
  const paymentInstructions=pickup
    ? 'Payment amount: '+money(subtotal)+'\nPayID: 0434 085 355\nOr bank transfer:\nAccount name: Nicholas Ong\nBSB: 112-879\nAccount number: 443678902\nPayment reference: '+ref+'\n\nPlease pay only after checking the order details. We will verify funds before arranging pickup.'
    : 'Your delivery/postage cost is not yet final. Please do not pay yet. We will email you the confirmed total and payment instructions once packing and delivery have been checked.';
  const customerText='HẠT MỘC — ORDER CONFIRMATION\nReference: '+ref+'\n\nHi '+name+',\n\nThank you for your Hạt Mộc order. We have received your order details. Product availability is subject to confirmation.\n\n'+lines.join('\n')+'\n\nSubtotal: '+money(subtotal)+'\nDelivery: '+(pickup?'Free Bankstown pickup':method==='post'?'Australia-wide shipping':'Local delivery by arrangement')+'\nPostage/delivery: '+postage+'\n'+(pickup?'Amount to pay: '+money(subtotal):'Estimated order total: '+total)+'\n\nPAYMENT\n'+paymentInstructions+'\n\nNEXT STEPS\nOnce we confirm your payment has arrived, we will arrange your pickup or dispatch your order within 2 business days. The 2-business-day timeframe refers to dispatch, not delivery.\n\nQuestions? Reply to this email.\n\nHạt Mộc — The Raw Taste\nhatmoc.com';
  const rows=lines.map(x=>'<tr><td style="padding:9px 0;border-bottom:1px solid #e9e2d2">'+escape(x)+'</td></tr>').join('');
  const paymentHtml=pickup
    ? '<p style="margin:8px 0"><b>Amount to pay:</b> '+escape(money(subtotal))+'</p><p><b>PayID:</b> 0434 085 355</p><p style="margin:8px 0"><b>Bank transfer</b><br>Account name: Nicholas Ong<br>BSB: 112-879<br>Account number: 443678902</p><p><b>Payment reference:</b> '+escape(ref)+'</p><p style="font-size:13px">We will check that payment has arrived before arranging pickup.</p>'
    : '<p>We are confirming your final postage or delivery fee. <b>Please do not pay yet.</b> We will send your final total and payment instructions separately.</p>';
  const customerHtml='<!doctype html><html><body style="margin:0;background:#f5f3ed;font-family:Arial,sans-serif;color:#183a2c"><div style="max-width:580px;margin:24px auto;background:#fff;border:1px solid #e4dcc9"><div style="background:#103d2b;color:#f4dc9e;padding:28px;text-align:center"><div style="font-size:30px;font-weight:bold">Hạt Mộc</div><div style="font-size:12px;letter-spacing:3px">THE RAW TASTE</div></div><div style="padding:28px"><h1 style="font-size:23px;margin:0 0 8px">Thank you for your order!</h1><p style="color:#68766c">Order reference: <b>'+escape(ref)+'</b></p><p>Hi '+escape(name)+',</p><p>We have received your order. Product availability is subject to confirmation.</p><h2 style="font-size:17px;margin-top:25px">Your order</h2><table style="width:100%;border-collapse:collapse">'+rows+'</table><p><b>Products subtotal:</b> '+escape(money(subtotal))+'<br><b>Delivery:</b> '+escape(pickup?'Free Bankstown pickup':method==='post'?'Australia-wide shipping':'Local delivery by arrangement')+'<br><b>Postage/delivery:</b> '+escape(postage)+'<br><b>'+(pickup?'Amount to pay':'Estimated total')+':</b> '+escape(pickup?money(subtotal):total)+'</p><div style="background:#f7f3e7;border-left:4px solid #c5a75c;padding:16px;margin:24px 0"><h2 style="font-size:17px;margin:0 0 10px">Payment and next steps</h2>'+paymentHtml+'</div><p>After we verify your payment, we will arrange pickup or dispatch your order within <b>2 business days</b>. Delivery transit time is additional.</p><p>Questions? Simply reply to this email.</p><p style="margin-top:25px">Thank you for supporting Hạt Mộc!</p></div><div style="background:#103d2b;color:#f4dc9e;text-align:center;padding:18px;font-size:13px">Hạt Mộc · The Raw Taste<br><a href="https://www.hatmoc.com" style="color:#f4dc9e;text-decoration:none">www.hatmoc.com</a></div></div></body></html>';
  let acknowledgementSent=false;
  try{
   const customerResponse=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],reply_to:'nick_ong@outlook.com',subject:'Hạt Mộc | Order confirmation '+ref,text:customerText,html:customerHtml}),signal:AbortSignal.timeout(10000)});
   acknowledgementSent=customerResponse.ok;
  }catch(e){/* Owner already received the order; avoid duplicate submissions. */}
  return res.status(200).json({ok:true,acknowledgementSent});
 }catch(e){return res.status(502).json({error:'Unable to deliver your order right now. Please try again.'});}
};
