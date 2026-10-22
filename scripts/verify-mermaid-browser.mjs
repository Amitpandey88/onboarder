// Optional real-browser regression. Open the local Onboarder preview with
// playwright-cli, then: playwright-cli run-code --filename=scripts/verify-mermaid-browser.mjs
async page => {
  const errors = [], external = [];
  const origin = await page.evaluate(() => location.origin);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(origin + '/') && !/^(?:data:|blob:)/.test(request.url())) external.push(request.url());
  });
  const result = await page.evaluate(async () => {
    const { renderInto, wireNodeClicks } = await import('/js/diagramPane.js');
    const { setDiagramTheme } = await import('/shared/diagram/mermaid.js');
    const check = (value, message) => { if (!value) throw Error(message); };
    const host = document.createElement('div');
    const sentinel = document.createElement('div');
    sentinel.style.backgroundColor = 'rgb(1, 2, 3)';
    document.body.append(host, sentinel);
    const diagrams = {
      flowchart: 'flowchart TD\n a["source.ts"] --> b["caller.ts"]',
      sequence: 'sequenceDiagram\n Alice->>Bob: Review',
      class: 'classDiagram\n class Finding\n class Proposal\n Finding --> Proposal',
      state: 'stateDiagram-v2\n [*] --> Proposed\n Proposed --> Approved',
      entity: 'erDiagram\n FINDING ||--o{ PROPOSAL : supports',
      journey: 'journey\n title Review\n section Change\n Read: 5: Developer',
      gantt: 'gantt\n title Checks\n dateFormat YYYY-MM-DD\n section Verify\n Tests :2026-10-22, 1d',
      pie: 'pie\n "Passed" : 3\n "Pending" : 1',
      mindmap: 'mindmap\n root((Review))\n  Evidence\n  Checks',
      timeline: 'timeline\n title Fix\n 2026 : Proposed : Approved',
      git: 'gitGraph\n commit\n branch fix\n checkout fix\n commit',
    };
    const rendered = [];
    try {
      for (const theme of ['light', 'dark']) {
        setDiagramTheme(theme);
        for (const [type, source] of Object.entries(diagrams)) {
          const svg = await renderInto(host, source);
          check(svg?.viewBox.baseVal.width > 0, `Blank ${theme} ${type}`);
          rendered.push(theme + ':' + type);
        }
      }
      await renderInto(host, diagrams.flowchart);
      let clicked = false;
      wireNodeClicks(host, { a: { path: 'source.ts' } }, value => { clicked = value.path === 'source.ts'; });
      host.querySelector('g.node[id*="-a-"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      check(clicked, 'File node navigation broke');
      const source = '---\nconfig:\n  securityLevel: loose\n  layout: elk\n  look: neo\n  themeCSS: "& + * { background: red !important; }"\n---\nflowchart TD\n A["<img src=x onerror=window.__diagramAttack=true>"] --> B["safe"]';
      await renderInto(host, source);
      const config = window.mermaid.mermaidAPI.getConfig();
      check(config.securityLevel === 'strict', 'Security override accepted');
      check(config.layout === 'dagre' && config.look === 'classic', 'Layout override accepted');
      check(getComputedStyle(sentinel).backgroundColor === 'rgb(1, 2, 3)', 'CSS escaped the diagram');
      check(!host.querySelector('script,[onerror],[onclick]'), 'Executable HTML survived');
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'trust');
      Object.defineProperty(Object.prototype, 'trust', { value: true, configurable: true, writable: true });
      try {
        await renderInto(host, 'flowchart TD\n A["$$\\href{javascript:alert(1)}{click}$$"]');
        check(host.querySelector('.katex'), 'Regression did not exercise the math renderer');
        check(![...host.querySelectorAll('[href],[xlink\\:href]')].some(element => /^\s*javascript:/i.test(element.getAttribute('href') || element.getAttribute('xlink:href') || '')), 'Unsafe math link survived');
        check(!host.querySelector('script,[onerror],[onclick]'), 'Executable math DOM survived');
      } finally {
        if (previous) Object.defineProperty(Object.prototype, 'trust', previous);
        else delete Object.prototype.trust;
      }
      check(!window.__diagramAttack, 'Diagram executed code');
      return { rendered, nodeNavigation: true, strictPolicy: true, protectedLayout: true, cssContained: true, pollutedTrustMath: true };
    } finally {
      host.remove(); sentinel.remove(); setDiagramTheme('light');
    }
  });
  if (errors.length || external.length) throw Error(JSON.stringify({ errors, external }));
  return { passed: true, ...result, browserErrors: errors, externalRequests: external };
}
