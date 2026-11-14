import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('build gives changed application code a new URL and keeps relative module paths valid',()=>{
 const dir=mkdtempSync(join(tmpdir(),'fh-app-version-'));
 try{mkdirSync(join(dir,'public'));writeFileSync(join(dir,'public/index.html'),'<script type="module" src="/app.mjs?v=old"></script>');
  const run=()=>execFileSync(process.execPath,[fileURLToPath(new URL('./server/version-app.mjs',import.meta.url))],{cwd:dir});
  writeFileSync(join(dir,'public/core.mjs'),'export const test=true;\n');writeFileSync(join(dir,'public/app.mjs'),'import "./core.mjs";\n');run();const first=readFileSync(join(dir,'public/index.html'),'utf8');const name=first.match(/src="\/([^"]+)"/)[1];assert.match(name,/^app-[a-f0-9]{16}\.mjs$/);const module=readFileSync(join(dir,'public',name),'utf8');const dependency=module.match(/core-[a-f0-9]{16}\.mjs/)[0];assert.equal(readFileSync(join(dir,'public',dependency),'utf8'),'export const test=true;\n');
  run();assert.equal(readFileSync(join(dir,'public/index.html'),'utf8'),first);
  writeFileSync(join(dir,'public/app.mjs'),'import "./core.mjs";\n// fixed\n');run();assert.notEqual(readFileSync(join(dir,'public/index.html'),'utf8'),first);const second=readFileSync(join(dir,'public/index.html'),'utf8');writeFileSync(join(dir,'public/core.mjs'),'export const test=false;\n');run();assert.notEqual(readFileSync(join(dir,'public/index.html'),'utf8'),second);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
