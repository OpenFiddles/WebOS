const express=require("express");
const cors=require("cors");
const multer=require("multer");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawn}=require("node:child_process");
const {createClient}=require("@supabase/supabase-js");
const ffmpeg=require("ffmpeg-static");
const app=express();
const origins=(process.env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
app.use(cors({origin(origin,cb){if(!origin||!origins.length||origins.includes(origin))return cb(null,true);cb(new Error("Origin is not allowed."));},methods:["POST","GET"],allowedHeaders:["Authorization","Content-Type"]}));
const upload=multer({dest:os.tmpdir(),limits:{fileSize:1024*1024*1024,files:1}});
const supabase=createClient(process.env.SUPABASE_URL||"",process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||"");
const run=(args)=>new Promise((resolve,reject)=>{const child=spawn(ffmpeg,args,{windowsHide:true});let stderr="";child.stderr.on("data",d=>stderr+=d.toString());child.on("error",reject);child.on("close",code=>code===0?resolve(stderr):reject(new Error(stderr.slice(-1800)||"FFmpeg exited with code "+code)));});
app.get("/health",(_req,res)=>res.json({ok:true,engine:"ffmpeg",maxUploadBytes:1024*1024*1024}));
app.post("/api/compress",upload.single("video"),async(req,res)=>{
 const input=req.file?.path;if(!input)return res.status(400).json({error:"Choose a video file."});
 const output=path.join(os.tmpdir(),"webos-"+Date.now()+"-"+Math.random().toString(36).slice(2)+".mp4");
 try{
  const auth=String(req.headers.authorization||"");const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token)return res.status(401).json({error:"Sign in to WebOS before using video compression."});
  const {data:userData,error:userError}=await supabase.auth.getUser(token);if(userError||!userData.user)return res.status(401).json({error:"Your WebOS session is invalid or expired."});
  const target=Math.max(1024*1024,Math.min(100*1024*1024,Number(req.body.targetBytes)||30*1024*1024));
  const duration=Math.max(1,Math.min(60*60*6,Number(req.body.duration)||0));
  if(!duration) return res.status(400).json({error:"Could not read video duration. Play the video once and retry."});
  const audioKbps=96,overhead=0.92;let videoKbps=Math.max(180,Math.floor((target*8*overhead/duration/1000)-audioKbps));
  let finalSize=0;
  for(let attempt=0;attempt<3;attempt++){
   await run(["-y","-i",input,"-map","0:v:0","-map","0:a?","-vf","scale='min(1280,iw)':-2","-c:v","libx264","-preset","veryfast","-b:v",videoKbps+"k","-maxrate",videoKbps+"k","-bufsize",videoKbps*2+"k","-c:a","aac","-b:a",audioKbps+"k","-movflags","+faststart","-sn","-dn",output]);
   finalSize=fs.statSync(output).size;if(finalSize<=target)break;videoKbps=Math.max(120,Math.floor(videoKbps*(target/finalSize)*0.88));
  }
  res.setHeader("Content-Type","video/mp4");res.setHeader("Content-Disposition",'attachment; filename="webos-compressed.mp4"');res.setHeader("X-WebOS-Target-Reached",String(finalSize<=target));res.setHeader("X-WebOS-Output-Bytes",String(finalSize));
  const stream=fs.createReadStream(output);stream.pipe(res);stream.on("close",cleanup);stream.on("error",cleanup);
 }catch(error){if(!res.headersSent)res.status(500).json({error:"FFmpeg compression failed: "+String(error.message||error).slice(0,500)});cleanup();}
 function cleanup(){for(const p of [input,output])try{if(p&&fs.existsSync(p))fs.unlinkSync(p);}catch(_){}}
});
const port=process.env.PORT||8080;app.listen(port,()=>console.log("WebOS FFmpeg worker listening on "+port));
