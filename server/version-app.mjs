import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Give the entry and all local module dependencies a shared content version.
const modules=readdirSync('public').filter(n=>n.endsWith('.mjs')&&!/-[a-f0-9]{16}\.mjs$/.test(n)).sort();
const sources=Object.fromEntries(modules.map(name=>[name,readFileSync('public/'+name,'utf8')]));
const version=createHash('sha256').update(modules.map(n=>n+'\0'+sources[n]).join('\0')).digest('hex').slice(0,16);
const paths=Object.fromEntries(modules.map(name=>[name,name.slice(0,-4)+'-'+version+'.mjs']));
for(const name of modules){
 const code=sources[name].replace(/(['"])\.\/([^'"]+\.mjs)(?:\?[^'"]*)?\1/g,(match,quote,target)=>paths[target]?quote+'./'+paths[target]+quote:match);
 writeFileSync('public/'+paths[name],code);
}
const index=readFileSync('public/index.html','utf8'),name=paths['app.mjs'];
const versioned=index.replace(/src="\/app(?:-[a-f0-9]+)?\.mjs(?:\?[^"\s]*)?"/,`src="/${name}"`);
if(versioned===index&&!index.includes(`src="/${name}"`))throw Error('Application entry script not found.');
writeFileSync('public/index.html',versioned);
console.log('Versioned application entry:',name);
