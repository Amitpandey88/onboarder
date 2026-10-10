import path from 'node:path';
import os from 'node:os';

// Installers and optional analyzers need a usable OS environment, not the
// server's API keys, loader hooks, repository overrides or package credentials.
const OS_KEYS = new Set(['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'SYSTEMROOT', 'WINDIR',
  'COMSPEC', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'USER', 'USERNAME',
  'LOGNAME', 'SHELL', 'TERM', 'COLORTERM', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'CI', 'NO_COLOR']);

export function isolatedEnvironment(source: NodeJS.ProcessEnv = process.env, extraKeys: readonly string[] = [], configurationDirectory?: string): NodeJS.ProcessEnv {
  const allowed = new Set([...OS_KEYS, ...extraKeys.map(key => key.toUpperCase())]);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) if (value !== undefined && allowed.has(key.toUpperCase())) env[key] = value;
  const envPath = Object.entries(source).find(([key]) => key.toUpperCase() === 'PATH')?.[1] || '';
  env.PATH = envPath.split(path.delimiter).filter(entry => path.isAbsolute(entry)).join(path.delimiter);
  // Project and user package configuration must not redirect these public tools.
  env.NPM_CONFIG_IGNORE_SCRIPTS = 'true';
  env.NPM_CONFIG_REGISTRY = 'https://registry.npmjs.org/';
  // npm rejects loading the same file as both user and global configuration.
  // Production callers supply their private staging directory; absent files
  // are treated as empty, with distinct paths and no repository discovery.
  env.NPM_CONFIG_USERCONFIG = configurationDirectory ? path.join(configurationDirectory, 'npm-user.rc') : os.devNull;
  if (configurationDirectory) env.NPM_CONFIG_GLOBALCONFIG = path.join(configurationDirectory, 'npm-global.rc');
  env.PIP_CONFIG_FILE = os.devNull;
  env.PIP_INDEX_URL = 'https://pypi.org/simple';
  env.UV_NO_CONFIG = '1';
  env.UV_DEFAULT_INDEX = 'https://pypi.org/simple';
  return env;
}
