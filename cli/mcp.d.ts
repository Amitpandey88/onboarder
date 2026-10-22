export declare const MCP_HELP = "\n  Onboarder MCP \u2014 connect a local AI client to repository analysis.\n\n  onboarder mcp                     Serve JSON-RPC over stdio (client launches this)\n  onboarder mcp config [json|toml]  Print ready-to-paste client configuration\n  onboarder mcp catalog [--json]   Discover tools, resources and guided prompts\n  onboarder mcp check [--json]     Verify startup, handshake and the tool catalog\n\n  Built-in analysis reads repositories. Deep-analysis engines may execute repo\n  configuration. Every stdio client has its own selected repository. Start with\n  onboarder_scan {\"path\":\"/absolute/repository\"}; rescan after changing files.\n  No web server or AI login is needed.\n";
export declare function mcpCommand(action?: string, rest?: string[], flags?: {
    help?: boolean;
    json?: boolean;
}): Promise<0 | 1>;
