#!/usr/bin/env python3
"""Check built routes, local links, anchors, duplicate IDs, and reference coverage."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,sys,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent; OUT=ROOT/'dist'
class Document(HTMLParser):
    def __init__(self): super().__init__(); self.ids=[];self.links=[];self.h1=0;self.title=False;self.inline=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if 'id' in attrs:self.ids.append(attrs['id'])
        if tag=='h1':self.h1+=1
        if tag=='title':self.title=True
        if tag in ('a','link'):self.links.append(attrs.get('href',''))
        if tag in ('img','script','source'):self.links.append(attrs.get('src',''))
        if tag=='img':self.links.extend(attrs[k] for k in ('data-theme-light','data-theme-dark') if attrs.get(k))
        if tag=='script' and not attrs.get('src'):self.inline.append('inline script')
        if 'style' in attrs or any(k.startswith('on') for k in attrs):self.inline.append('inline style/event')

documents={}; errors=[]; total=0
for file in OUT.rglob('*.html'):
    text=file.read_text();d=Document();d.feed(text);documents[file.resolve()]=d
    if '\x00' in text or '{{' in text:errors.append(f'{file}: unresolved renderer tokens')
    if d.h1!=1 or not d.title:errors.append(f'{file}: needs one h1 and a title')
    if len(d.ids)!=len(set(d.ids)):errors.append(f'{file}: duplicate IDs')
    if d.inline:errors.append(f'{file}: incompatible with strict static CSP: {d.inline}')
for file,d in documents.items():
    for link in d.links:
        total+=1;u=urlsplit(link)
        if u.scheme or u.netloc or not link:continue
        target=(OUT/u.path.lstrip('/') if u.path.startswith('/') else file.parent/u.path).resolve()
        if not u.path:target=file
        if target.is_dir():target=target/'index.html'
        if not target.exists():errors.append(f'{file.relative_to(OUT)}: missing {link}')
        elif u.fragment and target.suffix=='.html' and unquote(u.fragment) not in documents[target].ids:errors.append(f'{file.relative_to(OUT)}: missing anchor {link}')
reference=json.loads((ROOT/'content/reference.json').read_text())
commands=(OUT/'docs/commands/index.html').read_text();mcp=(OUT/'docs/mcp-reference/index.html').read_text()
for c in reference['commands']:
    if f'id="{c["name"]}"' not in commands:errors.append('Missing slash command: '+c['name'])
for tool in reference['mcp']:
    if tool['name'].replace('_','-') not in mcp:errors.append('Missing MCP tool: '+tool['name'])
ET.parse(OUT/'sitemap.xml')
search=json.loads((OUT/'docs/search-index.json').read_text())
for item in search:
    u=urlsplit(item['url']);target=(OUT/u.path.lstrip('/')/'index.html').resolve()
    if target not in documents or u.fragment and u.fragment not in documents[target].ids:errors.append('Broken search result: '+item['url'])
if errors:
    print('\n'.join(errors));sys.exit(1)
print(f'Validated {len(documents)} HTML pages, {total} links/assets, {len(search)} search targets, {len(reference["commands"])} commands and {len(reference["mcp"])} MCP tools.')
