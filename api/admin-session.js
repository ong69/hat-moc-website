const crypto=require('crypto');
const {lifetime,eq,isAuthorized,sameOrigin,setCookie,secret}=require('./_admin-auth');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!process.env.HATMOC_ADMIN_PASSWORD)return res.status(503).json({error:'Admin password not configured'});
 if(req.method==='GET')return res.status(200).json({authenticated:isAuthorized(req)});
 if(req.method!=='POST'&&req.method!=='DELETE')return res.status(405).json({error:'Method not allowed'});
 if(!sameOrigin(req))return res.status(403).json({error:'Invalid request origin'});
 if(req.method==='DELETE'){setCookie(res,'',0);return res.status(200).json({ok:true})}
 const pwd=String((req.body||{}).password||'');
 if(!eq(pwd,process.env.HATMOC_ADMIN_PASSWORD))return res.status(401).json({error:'Incorrect password'});
 const exp=String(Date.now()+lifetime),mac=crypto.createHmac('sha256',secret()).update(exp).digest('hex');
 setCookie(res,exp+'.'+mac,Math.floor(lifetime/1000));
 return res.status(200).json({ok:true});
};
