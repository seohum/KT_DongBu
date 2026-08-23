const ALLOWED_ORIGINS=new Set(['https://seohum.github.io','https://kt-dong-bu.vercel.app']);
const SHEETS_ENDPOINT='https://script.google.com/macros/s/AKfycbxi7OLg1zqI9BZtxOHVg5tsL_mgU_hj0zRnYY1vC92U9OGrxiwVDW9_Q6oDAIlJssYz/exec';
function cors(origin){return{'Access-Control-Allow-Origin':ALLOWED_ORIGINS.has(origin)?origin:'https://seohum.github.io','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store','Vary':'Origin'};}
function send(res,status,data,origin){Object.entries(cors(origin)).forEach(([k,v])=>res.setHeader(k,v));return res.status(status).json(data);}
function clean(v,max){return String(v||'').trim().slice(0,max);}
export default async function handler(req,res){
 const origin=String(req.headers.origin||'');
 if(req.method==='OPTIONS'){Object.entries(cors(origin)).forEach(([k,v])=>res.setHeader(k,v));return res.status(204).end();}
 if(req.method!=='POST')return send(res,405,{success:false,message:'허용되지 않은 요청입니다.'},origin);
 if(!ALLOWED_ORIGINS.has(origin))return send(res,403,{success:false,message:'허용되지 않은 사이트입니다.'},origin);
 try{
  const input=typeof req.body==='string'?JSON.parse(req.body):(req.body||{}),password=clean(input.password,200),applicationId=clean(input.applicationId,100);
  if(!password||!applicationId)return send(res,400,{success:false,message:'접수번호와 관리자 인증을 확인해주세요.'},origin);
  const auth=await fetch(SHEETS_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'list',password}),redirect:'follow'});
  const authResult=await auth.json().catch(()=>({}));
  if(!auth.ok||!authResult.success)return send(res,401,{success:false,message:'관리자 비밀번호가 올바르지 않습니다.'},origin);
  const upstream=await fetch(process.env.APPLICATION_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'getApplicationFiles',secret:process.env.APPLICATION_SECRET,applicationId}),redirect:'follow'});
  const result=await upstream.json().catch(()=>({}));
  if(!upstream.ok||!result.ok)throw new Error('file lookup failed');
  return send(res,200,{success:true,files:{folderUrl:result.folderUrl||'',pdfUrl:result.pdfUrl||'',idFrontUrl:result.idFrontUrl||'',idBackUrl:result.idBackUrl||''}},origin);
 }catch(error){console.error('application file lookup failed',error&&error.message);return send(res,404,{success:false,message:'저장된 신청 파일을 찾지 못했습니다.'},origin);}
}
