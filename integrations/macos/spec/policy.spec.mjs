import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetPath, validToken, terminalInput, trustedSender, endpointId, externalURL, projectPath } from '../src/policy.mjs';

test('only the application main frame receives native capabilities', () => {
  const frame = { url: 'onboarder://workspace/' }; const sender = { mainFrame: frame };
  assert.equal(trustedSender({ sender, senderFrame: frame }), true);
  for (const candidate of [{ url: 'https://example.com/' }, { url: 'onboarder://workspace.evil/' }, { url: 'onboarder://workspace/' }, null]) assert.equal(trustedSender({ sender, senderFrame: candidate }), false);
});
test('application assets cannot escape their packaged directory', () => {
  assert.equal(assetPath('/app/desktop', '/terminal.js'), '/app/desktop/terminal.js');
  for (const value of ['/../private', '/%2e%2e/private', '/bad%00.js', '/%ZZ', '/..\\private']) assert.equal(assetPath('/app/desktop', value), null);
});
test('each backend requires its exact session token', () => {
  assert.equal(validToken('a'.repeat(64), 'a'.repeat(64)), true);
  for (const supplied of [undefined, '', 'a', 'b'.repeat(64), ['a'.repeat(64)]]) assert.equal(validToken(supplied, 'a'.repeat(64)), false);
});
test('native typed project paths support home shortcuts, spaces and Unicode', () => {
  assert.equal(projectPath('~/work/project ü', '/Users/fixture'), '/Users/fixture/work/project ü');
  assert.equal(projectPath('~', '/Users/fixture'), '/Users/fixture');
  assert.equal(projectPath('work/project', '/Users/fixture'), '/Users/fixture/work/project');
  assert.throws(() => projectPath('', '/Users/fixture'));
});
test('terminal operations reject malformed capabilities and unbounded input', () => {
  assert.doesNotThrow(() => terminalInput('create', { kind: 'chat', cols: 100, rows: 24 }));
  for (const [action, input] of [['create', { kind: 'exec', cols: 100, rows: 24 }], ['resize', { id: 'a'.repeat(36), cols: 100000, rows: 24 }], ['write', { id: '../other', data: 'ls' }], ['write', { id: 'a'.repeat(36), data: 'x'.repeat(65537) }]]) assert.throws(() => terminalInput(action, input));
});
test('provider identities and external links reject executable and credential-bearing URLs', () => {
  assert.equal(endpointId('https://provider.example/v1/'), 'https://provider.example/v1');
  for (const value of ['javascript:alert(1)', 'file:///private/file', 'https://user:password@example.com']) { assert.throws(() => endpointId(value)); assert.throws(() => externalURL(value)); }
});
