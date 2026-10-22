// Install a local archive without scripts/development packages; never publishes.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const execute = promisify(execFile), project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const archive = path.resolve(process.argv[2] || ''); if (!archive.endsWith('.tgz')) throw Error('Pass a local npm archive.');
const parent = await mkdtemp(path.join(os.tmpdir(),'onboarder-package-audit-'));
const home = path.join(parent,'home'); await mkdir(home); const root = path.join(parent,'fixture'); await mkdir(root);
const env = { PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH, HOME:home, TMPDIR:os.tmpdir(), LANG:'en_US.UTF-8', ONBOARDER_CONFIG:path.join(home,'settings.json'), ONBOARDER_INTELLIGENCE_HOME:path.join(home,'intelligence'), ONBOARDER_AGENT_HOME:path.join(home,'agent'), npm_config_cache:path.join(parent,'cache'), npm_config_userconfig:path.join(parent,'npmrc'), GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:path.join(parent,'gitconfig') };
const run = (command,args,extra={})=>execute(command,args,{cwd:parent,env,timeout:60000,maxBuffer:4*1024*1024,...extra});
try {
  await writeFile(env.npm_config_userconfig,''); await writeFile(env.GIT_CONFIG_GLOBAL,'');
  await run('npm',['install','--prefix',parent,'--ignore-scripts','--omit=dev','--offline','--no-audit','--no-fund',archive]);
  const installed = path.join(parent,'node_modules/codebase-onboarder'), bin = path.join(installed,'bin/onboarder.js');
  const pkg = JSON.parse(await readFile(path.join(installed,'package.json'),'utf8')); assert.equal(Object.keys(pkg.dependencies||{}).length,0);
  await assert.rejects(readFile(path.join(installed,'src/cli/main.ts')));
  const git = args=>run('git',['-c','core.hooksPath=/dev/null','-C',root,...args]);
  await writeFile(path.join(root,'sample.js'),'export const parse = value => JSON.parse(value);\n');
  await git(['init','-q','-b','main']); await git(['add','.']); await git(['-c','user.name=Package fixture','-c','user.email=audit@example.invalid','commit','-qm','baseline']);
  await writeFile(path.join(root,'sample.js'),'export const parse = value => eval(value);\n');
  const cli = args=>run(process.execPath,[bin,...args]);
  assert.equal((await cli(['--version'])).stdout.trim(),pkg.version);
  assert.match((await cli(['--help'])).stdout,/onboarder review/);
  assert.match((await cli(['report',root,'--json'])).stdout,/sample\.js/);
  assert.match((await cli(['intelligence','scan',root,'--json'])).stdout,/sample\.js/);
  const report = JSON.parse((await cli(['review',root,'--json'])).stdout); assert.ok(report.findings.some(f=>f.rule==='eval'));
  assert.equal(JSON.parse((await cli(['review',root,'--sarif'])).stdout).version,'2.1.0');
  await git(['add','.']); assert.deepEqual(JSON.parse((await cli(['review',root,'--staged','--json'])).stdout).findings.map(f=>f.rule),report.findings.map(f=>f.rule));
  // The mode is part of the fingerprint; only the findings should match across modes.
  await assert.rejects(cli(['review',root,'--ai','--json']), e=>e.code===2 && JSON.parse(e.stdout).ai.status==='not-configured');
  const check = JSON.parse((await cli(['mcp','check','--json'])).stdout); assert.equal(check.ok,true);
  const preload = path.join(parent,'mock-github.mjs');
  await writeFile(preload, `import {triageFixture} from ${JSON.stringify(pathToFileURL(path.join(project,'tests/helpers/triageFixture.mjs')).href)}; globalThis.fetch=triageFixture().fetchImpl;`);
  const triage = args=>run(process.execPath,['--import',preload,bin,'triage',...args]);
  assert.equal(JSON.parse((await triage(['list','fixture/repo','--json'])).stdout).items[0].pull.number,7);
  assert.equal(JSON.parse((await triage(['inspect','fixture/repo','--pr','7','--json'])).stdout).freshness,'current');
  const editor = JSON.parse(await readFile(path.join(installed,'integrations/vscode/package.json'),'utf8'));
  await run(process.execPath,[path.join(installed,'scripts/package-editor.mjs'),path.join(parent,'installed-editor.vsix')]);
  assert.equal((await readFile(path.join(parent,'installed-editor.vsix'))).readUInt32LE(0),0x04034b50);
  const serverModule = pathToFileURL(path.join(installed,'server/index.js')).href;
  const child = spawn(process.execPath,['--input-type=module','-e',`const {createServer,CONFIG}=await import(${JSON.stringify(serverModule)}); const server=createServer(CONFIG); server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({auditPort:server.address().port})));`],{cwd:parent,env,stdio:['ignore','pipe','pipe']});
  try {
    const port = await new Promise((resolve,reject)=>{
      let buffer=''; const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Packaged web server startup timed out.'));},15000);
      const fail=()=>{clearTimeout(timer);reject(Error('Packaged web server exited before listening.'));};child.once('error',fail);child.once('exit',fail);
      child.stdout.on('data',data=>{buffer+=data.toString();for(const line of buffer.split('\n')){try{const v=JSON.parse(line);if(v.auditPort){clearTimeout(timer);child.off('error',fail);child.off('exit',fail);resolve(v.auditPort);return;}}catch{}}});
    });
    const base='http://127.0.0.1:'+port;
    for(const asset of ['/api/health','/','/app.js','/js/reviewView.js','/js/reviewFix.js','/js/reviewAI.js','/js/triageView.js','/vendor/mermaid.min.js','/vendor/monaco/vs/loader.js']){
      const res=await fetch(base+asset,{signal:AbortSignal.timeout(10000)});assert.equal(res.status,200,asset);await res.arrayBuffer();
    }
    const scan=await fetch(base+'/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:root}),signal:AbortSignal.timeout(10000)});
    assert.equal(scan.status,200);assert.equal((await scan.json()).scan.files[0].path,'sample.js');
  } finally { const closed=new Promise(resolve=>child.once('exit',resolve)); if(child.exitCode===null){child.kill('SIGTERM');await closed;} }
  const tests = await run(process.execPath,['--test','--test-name-pattern=packaged-compatible CLI',path.join(project,'tests/fixIntegration.test.js')],{env:{...env,ONBOARDER_TEST_CLI:bin}});
  assert.match(tests.stdout,/(?:pass 1|passed)/); assert.doesNotMatch(tests.stdout,/not ok/);
  const result = {schemaVersion:1,node:process.version,status:'passed',archiveSha256:createHash('sha256').update(await readFile(archive)).digest('hex'),version:pkg.version,runtimeDependencies:0,editorVersion:editor.version,installation:'Offline npm install --ignore-scripts --omit=dev into a fresh prefix/home; no source tree or development dependencies installed.',checks:['version/help','repository report and intelligence analysis','offline review','staged review','SARIF','AI unavailable is explicit','MCP self-check','mocked read-only GitHub triage list/inspect','packaged editor VSIX generation','packaged web server/health/browser assets/scan API','separate-process mocked-provider CLI proposal/show/approval/apply/real baseline-result verification/status/rollback'],model:'mock HTTP provider; no external model',externalWrites:0};
  if(process.argv[3]) await writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2));
} finally { await rm(parent,{recursive:true,force:true}); }
