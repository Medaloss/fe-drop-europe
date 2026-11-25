import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Prévisualisation locale : le service Cloudflare n’est pas encore déployé.'}));return;}
 const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
 if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{const bytes=await fs.readFile(f);res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end('Introuvable');}
}).listen(8788,'127.0.0.1',()=>console.log('Local URL: http://127.0.0.1:8788'));
