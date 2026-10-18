import { McpRunner, mcpConfig } from '../server/mcp/runner.js';
import { PACKAGE_VERSION, PROTOCOL_VERSION } from '../server/mcp/protocol.js';
import { toolDefinitions } from '../server/mcp/tools.js';
import { resourceTemplates, promptDefinitions } from '../server/mcp/context.js';

export const MCP_HELP = `
  Onboarder MCP — connect a local AI client to repository analysis.

  onboarder mcp                     Serve JSON-RPC over stdio (client launches this)
  onboarder mcp config [json|toml]  Print ready-to-paste client configuration
  onboarder mcp catalog [--json]   Discover tools, resources and guided prompts
  onboarder mcp check [--json]     Verify startup, handshake and the tool catalog

  Built-in analysis reads repositories. Deep-analysis engines may execute repo
  configuration. Every stdio client has its own selected repository. Start with
  onboarder_scan {"path":"/absolute/repository"}; rescan after changing files.
  No web server or AI login is needed.
`;

export async function mcpCommand(action?: string, rest: string[] = [], flags: { help?: boolean; json?: boolean } = {}) {
  if (flags.help) { console.log(MCP_HELP); return 0; }
  if (!action) {
    await import('../server/mcp/standalone.js');
    return 0;
  }
  if (action === 'config') {
    const format = rest[0] || 'json';
    if (rest.length > 1 || !['json', 'toml'].includes(format)) throw new Error('Use onboarder mcp config json or onboarder mcp config toml.');
    const { command, args } = mcpConfig(null);
    console.log(format === 'json' ? JSON.stringify({ mcpServers: { onboarder: { command, args } } }, null, 2)
      : `[mcp_servers.onboarder]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}`);
    return 0;
  }
  if (rest.length) throw new Error('Unexpected arguments. Use onboarder mcp --help.');
  if (action === 'catalog') {
    const data = { version: PACKAGE_VERSION, protocolVersion: PROTOCOL_VERSION,
      tools: toolDefinitions(), resources: resourceTemplates(), prompts: promptDefinitions() };
    if (flags.json) console.log(JSON.stringify(data, null, 2));
    else {
      console.log(`\n  Onboarder ${data.version} · MCP ${data.protocolVersion}\n`);
      console.log(`  ${data.tools.length} tools\n` + data.tools.map(t => `    ${t.name.padEnd(28)} ${t.annotations.readOnlyHint ? 'read only' : 'runs external engines'}`).join('\n'));
      console.log(`\n  ${data.resources.length} resource templates\n` + data.resources.map(r => `    ${r.title}`).join('\n'));
      console.log(`\n  ${data.prompts.length} guided prompts\n` + data.prompts.map(p => `    ${p.name.padEnd(28)} ${p.title}`).join('\n'));
      console.log('\n  Next: onboarder mcp config · onboarder mcp check\n');
    }
    return 0;
  }
  if (action === 'check') {
    const runner = new McpRunner({});
    try {
      const status = await runner.start();
      const data = { ok: status.state === 'running', version: status.version, protocolVersion: status.protocolVersion,
        toolCount: status.toolCount, resourceTemplates: status.resources.length, prompts: status.prompts.length, error: status.lastError || null };
      console.log(flags.json ? JSON.stringify(data, null, 2) : data.ok
        ? `\n  ✓ MCP ready · ${data.toolCount} tools · ${data.resourceTemplates} resource templates · ${data.prompts} prompts\n  Startup, protocol handshake and tool discovery passed.\n  Next: onboarder mcp config\n`
        : `\n  MCP check failed: ${data.error || 'The process did not become ready.'}\n`);
      return data.ok ? 0 : 1;
    } finally { await runner.stop(); }
  }
  throw new Error('Choose mcp config, catalog, or check. Use onboarder mcp --help.');
}
