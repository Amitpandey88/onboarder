// A deterministic, dependency-free ZIP writer for the small local VSIX.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(path.join(root, 'integrations/vscode/package.json'), 'utf8'));
const output = process.argv[2] || path.join(root, 'integrations/vscode/dist/onboarder-' + pkg.version + '.vsix');
const crc = bytes => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
const entries = [
  ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="txt" ContentType="text/plain"/></Types>'],
  ['extension.vsixmanifest', '<?xml version="1.0"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="onboarder" Version="' + pkg.version + '" Publisher="' + pkg.publisher + '"/><DisplayName>Onboarder</DisplayName><Description xml:space="preserve">' + pkg.description + '</Description><Tags>code,architecture,onboarding</Tags><Categories>Other</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="' + pkg.engines.vscode + '"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties><License>extension/LICENSE.txt</License></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'],
];
for (const file of ['package.json', 'extension.cjs', 'README.md']) entries.push(['extension/' + file, await readFile(path.join(root, 'integrations/vscode', file))]);
entries.push(['extension/LICENSE.txt', await readFile(path.join(root, 'LICENSE'))]);
const local = []; const central = []; let offset = 0;
for (const [name, value] of entries) {
  const filename = Buffer.from(name); const data = Buffer.isBuffer(value) ? value : Buffer.from(value); const checksum = crc(data);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
  local.push(header, filename, data);
  const item = Buffer.alloc(46); item.writeUInt32LE(0x02014b50); item.writeUInt16LE(20, 4); item.writeUInt16LE(20, 6); item.writeUInt32LE(checksum, 16);
  item.writeUInt32LE(data.length, 20); item.writeUInt32LE(data.length, 24); item.writeUInt16LE(filename.length, 28); item.writeUInt32LE(offset, 42);
  central.push(item, filename); offset += header.length + filename.length + data.length;
}
const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, Buffer.concat([...local, directory, end]));
console.log(output);
