// The "AI draft" button: ask a model to redraw whatever the canvas is showing.
//
// Every view has a static diagram built from the import graph, and that is what
// loads. This is the optional second opinion — the model gets a fact sheet (see
// aiFacts.js) and answers with Mermaid, which is cached per view so flipping
// between the two is instant afterwards.
//
// Three states for one button: draw, drawn (flip back to static), and drawing.
// Nothing here is required for the app to work; with no endpoint configured the
// button opens the settings drawer and says so.
import { extractAIDiagram, matchNodeText } from '../../shared/diagram/aiMermaid.js';
import { streamExplain } from './api.js';
import { state, aiViewKey } from './state.js';
import { gatherFileContext } from './repoFiles.js';
import { diagramTarget, externalsFor, overviewFacts, layersFacts, servicesFacts, fileFacts, tourStopFacts, folderFacts, } from '../../shared/diagram/aiFacts.js';
import * as llm from './llm.js';
const MAX_TOKENS = 4000;
const PROGRESS_MS = 1000;
let btn = null;
let statusEl = null;
let nodeHost = null;
let pending = null;
let hooks = {
    onRender: (..._args) => { },
    onValidate: async (_source) => { },
    onOpenFile: (..._args) => { },
    onOpenSettings: (..._args) => { },
    onToast: (..._args) => { },
};
export function initAiDraft(options) {
    btn = options.host;
    statusEl = options.statusEl;
    nodeHost = options.nodeHost;
    hooks = { ...hooks, ...options };
    btn.addEventListener('click', () => {
        if (pending) {
            stopAiDraft();
            updateAiBtn();
            hooks.onToast('Sketch cancelled.');
            return;
        }
        const key = aiViewKey();
        if (state.aiActiveKey === key) {
            state.aiActiveKey = null; // back to static
            updateAiBtn(key);
            hooks.onRender();
            return;
        }
        if (state.aiDiagrams[key]) {
            state.aiActiveKey = key; // cached draft, instant
            updateAiBtn(key);
            hooks.onRender();
            return;
        }
        return drawWithAI(key);
    });
}
// Which of the three things the button currently offers. Called on every canvas
// render, because the answer depends on the view.
export function updateAiBtn(key = aiViewKey()) {
    if (pending && (pending.scan !== state.scan || pending.key !== key))
        stopAiDraft();
    btn.hidden = state.view === 'docs' || state.view === 'about'
        || (state.view === 'atlas' && !state.atlasOpen);
    if (pending) {
        btn.textContent = 'Cancel sketch';
        btn.title = 'Stop generating this sketch';
        btn.setAttribute('aria-busy', 'true');
    }
    else if (state.aiActiveKey === key) {
        btn.textContent = 'Static';
        btn.title = 'Back to the static diagram';
    }
    else {
        btn.textContent = state.aiDiagrams[key] ? 'AI sketch ✓' : 'AI sketch';
        btn.title = 'Ask the AI to draw this view';
    }
    if (!pending)
        btn.removeAttribute('aria-busy');
}
export function stopAiDraft() {
    pending?.controller.abort();
    pending = null;
    if (statusEl)
        statusEl.hidden = true;
    statusEl?.removeAttribute('aria-busy');
}
// AI nodes carry no stable ids — clicks are matched by label text instead.
export function wireAIClicks() {
    for (const g of nodeHost.querySelectorAll('g.node')) {
        const path = matchNodeText(g.textContent, state.scan.files);
        if (!path)
            continue;
        g.style.cursor = 'pointer';
        g.addEventListener('click', (event) => {
            event.stopPropagation();
            hooks.onOpenFile(path);
        });
    }
}
async function drawWithAI(key) {
    if (!llm.isConfigured()) {
        hooks.onOpenSettings();
        hooks.onToast('Choose Hermes or an endpoint in AI connection first.');
        return;
    }
    if (!state.scan)
        return;
    const settings = llm.getSettings();
    const job = pending = { key, scan: state.scan, controller: new AbortController() };
    updateAiBtn(key);
    statusEl.hidden = false;
    statusEl.setAttribute('aria-busy', 'true');
    // Live progress: elapsed time plus how much the model has written so far. A
    // reasoning model can be quiet for half a minute, and a canvas that says
    // nothing is indistinguishable from one that has hung.
    const startedAt = Date.now();
    let received = 0;
    const tick = () => {
        if (pending !== job)
            return;
        const secs = Math.round((Date.now() - startedAt) / 1000);
        const kb = received >= 1000 ? (received / 1000).toFixed(1) + 'k' : String(received);
        statusEl.textContent = `${settings.connection === 'hermes' ? 'Hermes' : 'The AI'} is sketching this view… ${kb} chars · ${secs}s`;
    };
    tick();
    const progressTimer = setInterval(tick, PROGRESS_MS);
    try {
        const { kind, facts } = await factsForView();
        job.controller.signal.throwIfAborted();
        const messages = llm.diagramMessages({ repoName: job.scan.name, kind, facts });
        let text = '';
        // Big budget, and no visible thinking where the dialect allows it:
        // reasoning models otherwise spend the whole allowance before a single
        // diagram line appears. Azure rejects that parameter outright.
        const providerOptions = llm.isAzureHost(settings.baseUrl) ? {} : { reasoning: { exclude: true } };
        for await (const delta of streamExplain({ ...settings, messages, maxTokens: MAX_TOKENS, providerOptions, purpose: 'diagram', signal: job.controller.signal })) {
            text += delta;
            received += delta.length;
            if (text.length > 120000)
                throw new Error('The sketch was too large. Try a smaller folder or file.');
        }
        job.controller.signal.throwIfAborted();
        const parsed = extractAIDiagram(text);
        if (!parsed)
            throw new Error('The model answered without a diagram. Try again.');
        try {
            await hooks.onValidate(parsed.body);
        }
        catch {
            throw new Error('The AI returned a diagram that could not be drawn. Try again.');
        }
        job.controller.signal.throwIfAborted();
        if (pending !== job || state.scan !== job.scan || aiViewKey() !== key)
            return;
        state.aiDiagrams[key] = { body: parsed.body, caption: parsed.caption };
        state.aiActiveKey = key;
        statusEl.hidden = true;
        await hooks.onRender();
    }
    catch (err) {
        if (pending === job && !job.controller.signal.aborted) {
            statusEl.hidden = true;
            hooks.onToast(err.message);
        }
    }
    finally {
        clearInterval(progressTimer);
        if (pending === job) {
            pending = null;
            statusEl.removeAttribute('aria-busy');
            updateAiBtn();
        }
    }
}
// Picks the sheet for the current view and fetches the source the file-shaped
// ones need. The choosing is pure and tested in aiFacts.js; this is the read.
async function factsForView() {
    const { scan, facts, manifest, patterns } = state;
    const target = diagramTarget(state);
    switch (target.view) {
        case 'map': return overviewFacts(scan, facts);
        case 'patterns': return layersFacts(facts, patterns);
        case 'services': return servicesFacts(scan, manifest);
        case 'tour': {
            const stop = state.tour.stops[state.tour.idx];
            if (!stop)
                return tourStopFacts({ stop: null });
            return tourStopFacts({
                ctx: await gatherFileContext(target.path),
                externals: externalsFor(scan, target.path),
                stop,
                index: state.tour.idx,
                total: state.tour.stops.length,
            });
        }
        case 'file': return fileFacts({
            ctx: await gatherFileContext(target.path),
            externals: externalsFor(scan, target.path),
        });
        default: return folderFacts(scan, facts, target.path);
    }
}
//# sourceMappingURL=aiDraft.js.map