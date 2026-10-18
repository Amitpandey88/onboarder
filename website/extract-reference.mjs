// Metadata only: no tool handlers are called and no user state is read.
import fs from 'node:fs';
import { CHAT_COMMANDS, commandGroup } from '../cli/chat/commands.js';
import { toolDefinitions } from '../server/mcp/tools.js';
import { languages } from '../shared/analyzer/languages/index.js';
import { routes } from '../server/router.js';
const {version}=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const reference={version,commands:CHAT_COMMANDS.map(([name,args,description])=>({name,args,description,group:commandGroup(name)})),mcp:toolDefinitions(),languages:languages.map(({label,extensions})=>({label,extensions})),routes:routes.map(({method,path,prefix})=>({method,path:path||prefix}))};
fs.writeFileSync(new URL('content/reference.json',import.meta.url),JSON.stringify(reference,null,2)+'\n');
console.log(`Extracted Onboarder ${version}: ${reference.commands.length} commands, ${reference.mcp.length} MCP tools.`);
