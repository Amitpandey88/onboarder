import { agentHome, hermesBinary, hermesEnvironment, setupAgent } from '../agent/config.js';
import { runProcess, terminalText } from '../agent/process.js';

export interface ModelProvider { id: string; name: string; models: string[] }
// Use the installed Hermes catalog, credential resolver and persistence logic.
// Only display fields cross this boundary; keys and endpoint credentials stay in Python.
const BRIDGE = String.raw`
import contextlib, io, json, sys
request = json.load(sys.stdin)
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
    from hermes_cli.config import load_config
    from hermes_cli.model_switch import switch_model, persist_model_selection
    from hermes_cli.model_switch_providers import list_picker_providers
    config = load_config()
    model = config.get('model') or {}
    if not isinstance(model, dict): model = {'default': str(model)}
    if request['action'] == 'catalog':
        import inspect
        kwargs = dict(current_provider=model.get('provider') or '', current_model=model.get('default') or '',
            current_base_url=model.get('base_url') or '', user_providers=config.get('providers'),
            custom_providers=config.get('custom_providers'), max_models=None, non_blocking_catalogs=True,
            probe_custom_providers=False, probe_current_custom_provider=False,
            excluded_providers=(config.get('model_catalog') or {}).get('excluded_providers'))
        accepted = inspect.signature(list_picker_providers).parameters
        rows = list_picker_providers(**{k: v for k, v in kwargs.items() if k in accepted})
        reply = {'providers': [{'id': str(p.get('slug') or ''), 'name': str(p.get('name') or p.get('slug') or ''),
            'models': [m for m in p.get('models', []) if isinstance(m, str)]} for p in rows]}
    else:
        result = switch_model(request['model'], current_provider=model.get('provider') or '',
            current_model=model.get('default') or '', current_base_url=model.get('base_url') or '',
            current_api_key=model.get('api_key') or '', explicit_provider=request['provider'],
            user_providers=config.get('providers'), custom_providers=config.get('custom_providers'))
        if result.success: persist_model_selection(result)
        reply = {'success': bool(result.success), 'model': result.new_model if result.success else '',
            'provider': result.target_provider if result.success else '',
            'error': '' if result.success else 'Hermes could not activate this model. Configure its provider with /model configure.'}
print('ONBOARDER_MODEL_JSON:' + json.dumps(reply))
`;

export class HermesModels {
  constructor(private home = agentHome(), private env: NodeJS.ProcessEnv = process.env, private execute = runProcess) {}
  private async request(request: Record<string, string>, signal: AbortSignal): Promise<any> {
    await setupAgent(this.home, this.env);
    const env = hermesEnvironment(this.home, this.env);
    // Hermes publishes its installation-bound Python/bootstrap argv. Retain that
    // bootstrap and replace only the verified entry point with our fixed bridge.
    const launch = await this.execute(hermesBinary(this.env), ['--print-runtime-command'], { env, signal, timeoutMs: 10000, maxBytes: 64000 });
    let command: unknown;
    try { command = JSON.parse(launch.stdout.trim()); } catch { throw new Error('Use /model configure with this Hermes installation.'); }
    if (launch.code || !Array.isArray(command) || command.length !== 4 || command.some(v => typeof v !== 'string') || command[1] !== '-I' || command[2] !== '-c') throw new Error('This Hermes launcher needs /model configure.');
    const entry = /runpy\.run_module\(['"]hermes_cli\.main['"],\s*run_name=['"]__main__['"],\s*alter_sys=True\)\s*$/.exec(command[3]);
    if (!entry || !command[3].slice(0, entry.index).includes('import hermes_bootstrap;')) throw new Error('This Hermes launcher needs /model configure.');
    const bootstrap = command[3].slice(0, entry.index) + 'exec(sys.argv[1])';
    const response = await this.execute(command[0], ['-I', '-c', bootstrap, BRIDGE], { env, signal, input: JSON.stringify(request), timeoutMs: 30000, maxBytes: 2 * 1024 * 1024 });
    const line = response.stdout.split('\n').find(s => s.startsWith('ONBOARDER_MODEL_JSON:'));
    if (response.code || !line) throw new Error('The model picker is unavailable. Choose Configure provider for the full Hermes setup.');
    return JSON.parse(line.slice('ONBOARDER_MODEL_JSON:'.length));
  }
  async catalog(signal: AbortSignal): Promise<ModelProvider[]> {
    const value = await this.request({ action: 'catalog' }, signal);
    if (!Array.isArray(value.providers)) throw new Error('Invalid Hermes model catalog.');
    return value.providers.slice(0, 200).filter((p: any) => typeof p.id === 'string' && p.id && typeof p.name === 'string' && Array.isArray(p.models))
      .map((p: any) => ({ id: terminalText(p.id).slice(0, 512), name: terminalText(p.name).slice(0, 512),
        models: [...new Set<string>(p.models.filter((m: unknown) => typeof m === 'string' && m.length > 0 && m.length <= 512).map((m: string) => terminalText(m)))].slice(0, 10000) }));
  }
  async select(model: string, provider: string, signal: AbortSignal): Promise<{ model: string; provider: string }> {
    if (!model || !provider || model.length > 512 || provider.length > 512) throw new Error('Choose a model and provider from the picker.');
    const result = await this.request({ action: 'select', model, provider }, signal);
    if (result.success !== true || typeof result.model !== 'string' || typeof result.provider !== 'string') throw new Error('Hermes could not activate this model. Use /model configure to check its credentials.');
    return { model: terminalText(result.model).slice(0, 512), provider: terminalText(result.provider).slice(0, 512) };
  }
}
