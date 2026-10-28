#!/usr/bin/env python3
"""Build dependency-free static docs from controlled Markdown and runtime metadata."""
from pathlib import Path
from html import escape
import json,re,shutil,math,hashlib

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'dist'
CONTENT=ROOT/'content'
BASE='https://onboarder.intellimatrix.in'
REV='20261028-downloads1'
PAGES=json.loads((CONTENT/'pages.json').read_text())
REFERENCE=json.loads((CONTENT/'reference.json').read_text())
assert REFERENCE['version']=='1.2.0'

def slug(text):
    return re.sub(r'[^a-z0-9]+','-',text.lower()).strip('-')

def url(href):
    if href.startswith(('http:','https:','mailto:','/','#')): return href
    # Source-relative references should point to the source tree, not a docs route.
    return 'https://github.com/Amitpandey88/onboarder/blob/main/'+href

def theme_image_attributes(src):
    dark_variants={
        '/assets/web-explore-1.0.5-light.jpg':'/assets/web-explore-1.0.5-dark.jpg',
        '/assets/web-landing-1.0.5-light.jpg':'/assets/web-landing-1.0.5-dark.jpg',
        '/assets/web-graph-1.0.5-light.jpg':'/assets/web-graph-1.0.5-dark.jpg',
        '/assets/web-intelligence-1.0.5-light.jpg':'/assets/web-intelligence-1.0.5-dark.jpg',

        '/assets/web-explore-1.0.4-light.jpg':'/assets/web-explore-20261011-dark.jpg',
        '/assets/web-landing-1.0.4-light.jpg':'/assets/web-landing-20261011-dark.jpg',
    }
    if src in dark_variants:
        return f' data-theme-light="{src}" data-theme-dark="{dark_variants[src]}" width="1440" height="900"'
    return ''

def inline(source):
    tokens=[]
    def hold(html):
        tokens.append(html); return f'\x00{len(tokens)-1}\x00'
    source=re.sub(r'`([^`]+)`',lambda m:hold('<code>'+escape(m[1])+'</code>'),source)
    source=re.sub(r'!\[([^\]]*)\]\(([^\s)]+)\)',lambda m:hold(f'<figure class="docs-figure"><img src="{escape(url(m[2]),quote=True)}"{theme_image_attributes(url(m[2]))} alt="{escape(m[1],quote=True)}" loading="lazy"></figure>'),source)
    source=re.sub(r'\[([^\]]+)\]\(([^\s)]+)\)',lambda m:hold(f'<a href="{escape(url(m[2]),quote=True)}">{inline(m[1])}</a>'),source)
    source=escape(source)
    source=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',source)
    source=re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)',r'<em>\1</em>',source)
    for i,t in reversed(list(enumerate(tokens))): source=source.replace(f'\x00{i}\x00',t)
    return source

def reference_blocks(text):
    groups=[]
    for command in REFERENCE['commands']:
        if command['group'] not in groups: groups.append(command['group'])
    commands=[]
    for group in groups:
        commands.append('### '+group+'\n')
        for c in [c for c in REFERENCE['commands'] if c['group']==group]:
            commands.append('#### /'+c['name']+'\n\n```text\n/'+c['name']+(' '+c['args'] if c['args'] else '')+'\n```\n\n'+c['description']+'\n')
    mcp=[]
    for tool in REFERENCE['mcp']:
        mcp.append('## '+tool['name']+'\n\n'+tool['description']+'\n\n### Input schema\n\n```json\n'+json.dumps(tool['inputSchema'],indent=2)+'\n```\n')
    langs=['| Source family | Extensions |','| --- | --- |']+[f"| {x['label']} | {', '.join('`'+e+'`' for e in x['extensions'])} |" for x in REFERENCE['languages']]
    routes=['| Method | Route |','| --- | --- |']+[f"| `{x['method']}` | `{x['path']}` |" for x in REFERENCE['routes']]
    return text.replace('{{commands}}','\n'.join(commands)).replace('{{mcp}}','\n'.join(mcp)).replace('{{languages}}','\n'.join(langs)).replace('{{routes}}','\n'.join(routes))

def render(text):
    lines=text.splitlines(); result=[]; headings=[]; ids={}; i=0
    def special(line):
        return not line.strip() or bool(re.match(r'^(#{1,6} |```|\||> |[-*] |\d+\. |---$)',line))
    while i<len(lines):
        line=lines[i]
        if not line.strip(): i+=1; continue
        if line.startswith('```'):
            language=line[3:].strip() or 'text'; block=[]; i+=1
            while i<len(lines) and not lines[i].startswith('```'): block.append(lines[i]); i+=1
            value='\n'.join(block)
            result.append(f'<div class="code-block"><div class="code-label"><span>{escape(language)}</span><button class="copy-code" type="button" aria-label="Copy code block">Copy</button></div><pre><code>{escape(value)}</code></pre></div>'); i+=1; continue
        m=re.match(r'^(#{1,6}) (.*)$',line)
        if m:
            level=max(2,len(m[1])); title=m[2]; plain=re.sub(r'[`*]','',title); base=slug(plain); count=ids.get(base,0); ids[base]=count+1; anchor=base+('-'+str(count+1) if count else '')
            headings.append(dict(id=anchor,title=plain,level=level))
            result.append(f'<h{level} id="{anchor}">{inline(title)}<a class="heading-anchor" href="#{anchor}" aria-label="Link to {escape(plain,quote=True)}">#</a></h{level}>'); i+=1; continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                row=lines[i].strip().strip('|').split('|')
                if not all(re.fullmatch(r'\s*:?-+:?\s*',s) for s in row): rows.append([s.strip() for s in row])
                i+=1
            cells=lambda row,tag: '<tr>'+''.join(f'<{tag}>{inline(s)}</{tag}>' for s in row)+'</tr>'
            result.append('<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable reference table"><table><thead>'+cells(rows[0],'th')+'</thead><tbody>'+''.join(cells(row,'td') for row in rows[1:])+'</tbody></table></div>'); continue
        if re.match(r'^[-*] |^\d+\. ',line):
            ordered=bool(re.match(r'^\d+\. ',line)); tag='ol' if ordered else 'ul'; items=[]
            pattern=r'^\d+\. ' if ordered else r'^[-*] '
            while i<len(lines) and re.match(pattern,lines[i]):
                item=re.sub(pattern,'',lines[i]); i+=1
                while i<len(lines) and lines[i].startswith('  ') and not lines[i].lstrip().startswith('```'):
                    item+=' '+lines[i].strip(); i+=1
                items.append('<li>'+inline(item)+'</li>')
            result.append(f'<{tag}>'+''.join(items)+f'</{tag}>'); continue
        if line.startswith('> '):
            block=[]
            while i<len(lines) and lines[i].startswith('> '): block.append(lines[i][2:]); i+=1
            result.append('<aside class="docs-callout">'+inline(' '.join(block))+'</aside>'); continue
        if line.strip()=='---': result.append('<hr>'); i+=1; continue
        para=[line]; i+=1
        while i<len(lines) and not special(lines[i]): para.append(lines[i]); i+=1
        result.append('<p>'+inline(' '.join(para))+'</p>')
    return '\n'.join(result),headings

SEARCH_DIALOG='''<dialog class="docs-search" id="docs-search" aria-labelledby="search-title"><div class="search-dialog-head"><label id="search-title" for="docs-query">Search documentation</label><button id="close-search" type="button" aria-label="Close search">Esc</button></div><div class="search-input-wrap"><span aria-hidden="true">⌕</span><input id="docs-query" type="search" autocomplete="off" placeholder="Try “install”, “Ctrl-O”, or “MCP”…" aria-controls="search-results"></div><p class="search-state" id="search-state" role="status" aria-live="polite">Search guides, commands, and tool schemas.</p><div id="search-results" class="search-results" role="list"></div><div class="search-footer"><span>↑ ↓ to navigate · Enter to open</span><span>Queries stay in your browser</span></div></dialog>'''

HEADER='''<a class="skip" href="#main">Skip to content</a><header class="header"><div class="wrap nav-inner"><a class="logo" href="/" aria-label="Onboarder home"><img src="/assets/onboarder-mark.svg" width="34" height="34" alt=""><span>onboarder<span class="logo-dot">.</span></span></a><nav id="navigation" aria-label="Main navigation"><a href="/#showcase">Product</a><a href="/#playground">Try the map</a><a href="/docs/" class="docs-nav-link">Documentation</a><a href="/docs/macos/">Mac app</a><a href="https://github.com/Amitpandey88/onboarder">GitHub ↗</a></nav><div class="nav-actions"><button class="search-toggle" type="button" aria-label="Search documentation"><span aria-hidden="true">⌕</span><span>Search docs</span><kbd>⌘ K</kbd></button><button class="theme-toggle" type="button" aria-label="Switch theme"><span aria-hidden="true">◐</span><span class="theme-label">Dark</span></button><a class="nav-cta" href="https://github.com/Amitpandey88/onboarder/releases/download/macos-v0.1.6/Onboarder-0.1.6-DEVELOPMENT-arm64.dmg" aria-label="Download Onboarder for macOS, Apple Silicon development preview">Download macOS ↓</a><button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="navigation"><span></span><span></span></button></div></div></header>'''

def nav(active):
    groups=[]
    for p in PAGES:
        if p['group'] not in groups: groups.append(p['group'])
    return ''.join(f'<div class="docs-nav-group"><h2>{escape(group)}</h2>'+''.join(f'<a href="/docs/{p["slug"]+"/" if p["slug"]!="overview" else ""}"'+(' aria-current="page"' if active==p['slug'] else '')+f'>{escape(p["title"])}</a>' for p in PAGES if p['group']==group)+'</div>' for group in groups)

def enrich_pages():
    # Share navigation, local search, branding, and theme on every existing page.
    for file in OUT.rglob('*.html'):
        html=file.read_text()
        html=re.sub(r'<a class="skip".*?</header>',HEADER,html,count=1,flags=re.S)
        html=html.replace('https://github.com/Amitpandey88/onboarder#readme','/docs/')
        html=re.sub(r'(<a[^>]*href="/docs/"[^>]*)(?: target="_blank"| rel="noopener noreferrer")',r'\1',html)
        html=re.sub(r'(<a[^>]*href="/docs/"[^>]*?) target="_blank"',r'\1',html)
        html=re.sub(r'(<a[^>]*href="/docs/"[^>]*?) rel="noopener noreferrer"',r'\1',html)
        for asset in ['styles.css','atlas.css','info-pages.css','experience.js','script.js','theme-init.js','info-pages.js']:
            html=re.sub(re.escape('/'+asset)+r'\?[^"\s]+','/'+asset+'?v='+REV,html)
        html=html.replace('</head>',f'<link rel="stylesheet" href="/site.css?v={REV}"><script src="/site.js?v={REV}" defer></script><meta property="og:image" content="{BASE}/assets/onboarder-showcase-poster.jpg"></head>')
        if file == OUT/'index.html':
            html=html.replace('<header class="header">','<header class="header"><div class="page-progress" aria-hidden="true"><span></span></div>',1)
            html=html.replace('href="/#showcase">Product','href="/#showcase" data-section-link>Product').replace('href="/#playground">Try the map','href="/#playground" data-section-link>Try the map')
        html=html.replace('</body>',SEARCH_DIALOG+'</body>')
        file.write_text(html)

if OUT.exists(): shutil.rmtree(OUT)
shutil.copytree(ROOT/'site',OUT)
enrich_pages()
FOOTER=re.search(r'<footer.*?</footer>',(OUT/'index.html').read_text(),flags=re.S)[0]
search=[]
for index,page in enumerate(PAGES):
    text=reference_blocks((CONTENT/(page['slug']+'.md')).read_text())
    body,headings=render(text)
    path='/docs/'+('' if page['slug']=='overview' else page['slug']+'/')
    dest=OUT/path.strip('/')/'index.html'; dest.parent.mkdir(parents=True,exist_ok=True)
    # Every section is searchable; snippets contain prose, not serialized markup.
    chunks=re.split(r'(?m)^#{1,6} ',text)
    def plain(s): return re.sub(r'\s+',' ',re.sub(r'[`*#>|]','',re.sub(r'!?\[([^\]]+)\]\([^)]+\)',r'\1',s))).strip()
    search.append(dict(title=page['title'],page=page['title'],group=page['group'],url=path,text=plain(page['description']+' '+chunks[0])))
    for h,chunk in zip(headings,chunks[1:]):
        search.append(dict(title=h['title'],page=page['title'],group=page['group'],url=path+'#'+h['id'],text=plain(chunk)))
    toc=''.join(f'<a href="#{h["id"]}">{escape(h["title"])}</a>' for h in headings if h['level']==2)
    # The command registry uses h3 groups, which make a useful compact TOC.
    if page['slug']=='commands': toc=''.join(f'<a href="#{h["id"]}">{escape(h["title"])}</a>' for h in headings if h['level']<=3)
    def pager(p,label):
        purl='/docs/'+('' if p['slug']=='overview' else p['slug']+'/')
        return f'<a href="{purl}"><span>{label}</span><strong>{escape(p["title"])}</strong></a>'
    pagination=(pager(PAGES[index-1],'← Previous') if index else '<span></span>')+(pager(PAGES[index+1],'Next →') if index+1<len(PAGES) else pager(PAGES[0],'Back to the guide →'))
    cards=''
    if page['slug']=='overview':
        cards='<div class="docs-start-cards">'+''.join(f'<a href="/docs/{s}/"><span class="eyebrow">{k}</span><h2>{t} <span aria-hidden="true">↗</span></h2><p>{d}</p></a>' for s,k,t,d in [('quickstart','START READING','Your first repository','Get a useful map in a few minutes.'),('chat','TERMINAL','Meet the chat workspace','Shortcuts, file browsing, and saved conversations.'),('web','VISUAL WORKSPACE','Explore the whole map','Folders, file actions, and locked threads.'),('self-hosting','YOUR SERVER','Run it on your terms','Authentication, HTTPS, and background startup.'),('commands','REFERENCE','Find a command','Chat commands, CLI options, and shortcuts.'),('mcp','INTEGRATIONS','Connect your agent','Use the local analysis engine from your MCP client.')])+'</div>'
    orientation=''
    if page['slug']=='overview':
        orientation='''<section class="docs-orientation" aria-labelledby="orientation-title"><div class="orientation-top"><span>REPOSITORY / ORIENTATION</span><span>START WITH A MAP</span></div><div class="orientation-body"><div class="orientation-copy"><span>SEE HOW IT CONNECTS</span><h2 id="orientation-title">Less searching.<br>More understanding.</h2><p>Find a starting point, trace the connections, and build a clearer picture.</p></div><svg class="orientation-map" viewBox="0 0 350 245" fill="none" aria-hidden="true"><circle class="map-orbit" cx="175" cy="123" r="105"/><path class="doc-edge" pathLength="1" d="M90 120H140M210 120H260M175 99V45H250M175 141V200H95"/><circle class="map-core" cx="140" cy="120" r="3"/><circle class="map-core" cx="210" cy="120" r="3"/><circle class="map-core" cx="175" cy="99" r="3"/><circle class="map-core" cx="175" cy="141" r="3"/><rect class="map-node-bg" x="17" y="101" width="76" height="38" rx="5"/><text x="55" y="124" text-anchor="middle">source</text><rect class="map-node-bg map-root" x="140" y="99" width="70" height="42" rx="6"/><text x="175" y="124" text-anchor="middle">your repo</text><rect class="map-node-bg" x="257" y="101" width="76" height="38" rx="5"/><text x="295" y="124" text-anchor="middle">imports</text><rect class="map-node-bg" x="244" y="28" width="73" height="34" rx="5"/><text x="280" y="49" text-anchor="middle">entry.ts</text><rect class="map-node-bg" x="23" y="182" width="76" height="34" rx="5"/><text x="61" y="203" text-anchor="middle">changes</text><text class="map-note" x="204" y="183">FOLLOW THE THREAD</text></svg></div><div class="orientation-links"><a href="/docs/quickstart/"><span>01</span> Open a repo <span aria-hidden="true">↗</span></a><a href="/docs/web/"><span>02</span> Trace imports <span aria-hidden="true">↗</span></a><a href="/docs/review/"><span>03</span> Review changes <span aria-hidden="true">↗</span></a></div></section>'''
        cards='<div class="docs-path-heading"><h2>Choose your path.</h2><p>SIX WAYS TO GET STARTED</p></div>'+cards
    minutes=max(1,math.ceil(len(text.split())/220))
    html=f'''<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(page['title'])} · Onboarder Docs</title><meta name="description" content="{escape(page['description'],quote=True)}"><meta name="theme-color" content="#f6f3ec"><link rel="canonical" href="{BASE}{path}"><meta property="og:title" content="{escape(page['title'],quote=True)} · Onboarder Docs"><meta property="og:description" content="{escape(page['description'],quote=True)}"><meta property="og:url" content="{BASE}{path}"><meta property="og:type" content="article"><meta property="og:image" content="{BASE}/assets/onboarder-showcase-poster.jpg"><link rel="icon" href="/assets/onboarder-mark.svg" type="image/svg+xml"><script src="/theme-init.js?v={REV}"></script><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/styles.css?v={REV}"><link rel="stylesheet" href="/info-pages.css?v={REV}"><link rel="stylesheet" href="/site.css?v={REV}"><script src="/experience.js?v={REV}" defer></script><script src="/site.js?v={REV}" defer></script><link rel="stylesheet" href="/docs-motion.css?v={REV}"><script src="/docs-motion.js?v={REV}" defer></script></head><body class="product docs-page docs-reader"><div class="docs-reading-track docs-js-only" aria-hidden="true"><span></span></div>{HEADER}<div class="docs-mobile-bar"><span>DOCUMENTATION · v1.2.0</span><button id="docs-menu-toggle" type="button" aria-expanded="false" aria-controls="docs-sidebar">Browse guides ↓</button></div><div class="docs-layout"><aside class="docs-sidebar" id="docs-sidebar" aria-label="Documentation navigation"><a class="docs-home" href="/docs/"><span>THE ONBOARDER GUIDE</span><span class="version-label">v1.2.0</span></a><button class="docs-sidebar-search search-toggle" type="button"><span>⌕ Search guides</span><kbd>⌘ K</kbd></button><nav aria-label="Guides">{nav(page['slug'])}</nav><a class="docs-source-link" href="https://github.com/Amitpandey88/onboarder">Open source · MIT ↗</a></aside><main class="docs-main" id="main"><nav class="docs-breadcrumb" aria-label="Breadcrumb"><a href="/docs/">Documentation</a><span aria-hidden="true">/</span><span>{escape(page['group'])}</span></nav><header class="docs-title"><p class="eyebrow">{escape(page['group'].upper())}</p><h1>{escape(page['title'])}<span class="logo-dot">.</span></h1><p>{escape(page['description'])}</p><div class="docs-meta"><span>Onboarder 1.2.0</span><span>{minutes} min read</span><time datetime="2026-10-28">Updated 28 Oct 2026</time></div><div class="docs-reading-tools docs-js-only"><span>Reading progress <strong data-docs-progress>0%</strong></span><button class="docs-motion-toggle" type="button" aria-pressed="false">Motion on</button></div></header>{orientation}{cards}<details class="docs-mobile-toc"><summary>On this page</summary><nav aria-label="Page sections">{toc}</nav></details><article class="docs-content">{body}</article><div class="docs-bottom-note"><span>Something unclear?</span><a href="https://github.com/Amitpandey88/onboarder/issues/new">Suggest an improvement ↗</a><a href="https://github.com/Amitpandey88/onboarder/blob/main/README.md">Read the published README ↗</a></div><nav class="docs-pagination" aria-label="Adjacent guides">{pagination}</nav></main><aside class="docs-toc"><div><div class="docs-readout docs-js-only"><span>YOUR READING PATH</span><strong data-docs-progress>0%</strong></div><p class="eyebrow">ON THIS PAGE</p><nav aria-label="On this page">{toc}</nav><div class="docs-toc-help"><p>Need a starting point?</p><a href="/docs/quickstart/">Open your first repo ↗</a></div></div></aside></div>{FOOTER}<button class="docs-back-top docs-js-only" type="button" aria-label="Back to documentation top" hidden><span aria-hidden="true">↑</span> Back to top</button><div class="toast" role="status" aria-live="polite"></div>{SEARCH_DIALOG}</body></html>'''
    dest.write_text(html)
(OUT/'docs/search-index.json').write_text(json.dumps(search,ensure_ascii=False,separators=(',',':'))+'\n')
urls=['/']+['/'+p.name+'/' for p in (ROOT/'site').iterdir() if p.is_dir() and p.name!='assets']+['/docs/'+('' if p['slug']=='overview' else p['slug']+'/') for p in PAGES]
(OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(f'<url><loc>{BASE}{u}</loc><lastmod>2026-10-28</lastmod></url>' for u in urls)+'</urlset>\n')
(OUT/'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: '+BASE+'/sitemap.xml\n')
print(f'Built {len(PAGES)} documentation pages, {len(search)} searchable sections, and {len(urls)} sitemap routes.')
