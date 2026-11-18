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
 const plain='New Hạt Mộc order enquiry\n\n'+fields.map(([k,v])=>k+': '+v).join('\n')+'\n\nConfirm availability, packing, final postage and payment with customer.';
 const html='<h2>New Hạt Mộc order enquiry</h2>'+fields.map(([k,v])=>'<p><strong>'+escape(k)+'</strong><br>'+escape(v).replace(/\n/g,'<br>')+'</p>').join('')+'<p>Confirm final postage and payment before fulfilment.</p>';
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
 if(!apiKey||!from)return res.status(503).json({error:'Online order submissions are not enabled yet. Please message us directly.'});
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:['nick_ong@outlook.com'],reply_to:email,subject:'Hạt Mộc order enquiry — '+name,text:plain,html}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return res.status(502).json({error:'Unable to deliver your order right now. Please try again or contact us directly.'});
  // Customer acknowledgement is sent only after the owner notification succeeds.
  const customerText='Hi '+name+',\n\nThank you for ordering from Hạt Mộc! We have received your order enquiry.\n\n'+lines.join('\n')+'\n\nProducts subtotal: '+money(subtotal)+'\nDelivery: '+(method==='pickup'?'Free Bankstown pickup':method==='post'?'Australia-wide postage':'Local delivery by arrangement')+'\nPostage: '+postage+'\nOrder total: '+total+'\n\nWhat happens next?\n1. We will confirm product availability, the final delivery or pickup arrangements and the final amount payable.\n2. We will then email you PayID and bank transfer instructions. Please do not pay until you receive that confirmation.\n3. Once we verify your payment, your order will be prepared for dispatch within 2 business days (or pickup will be arranged).\n\nIf you have questions, reply to this email.\n\nHạt Mộc — The Raw Taste\nwww.hatmoc.com';
  let acknowledgementSent=false;
  try{
   const customerResponse=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],reply_to:'nick_ong@outlook.com',subject:'Hạt Mộc — We received your order',text:customerText}),signal:AbortSignal.timeout(10000)});
   acknowledgementSent=customerResponse.ok;
  }catch(e){/* Owner already received order; do not ask customer to resubmit. */}
  return res.status(200).json({ok:true,acknowledgementSent});
 }catch(e){return res.status(502).json({error:'Unable to deliver your order right now. Please try again.'});}
};
