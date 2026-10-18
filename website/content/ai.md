- Works 100% offline out-of-the-box.
- In **AI connection**, choose **Hermes · use my configured login** to reuse the Onboarder CLI's Hermes provider and model. No API key is needed in the browser. The drawer shows the current model/provider; use **Test connection**, then **Save**. Install Hermes on the computer running the server and run `onboarder agent model` to sign in or change models, then refresh the configuration in the drawer.
- Connect any OpenAI-compatible LLM endpoint (OpenAI, Azure OpenAI, Groq, OpenRouter, Ollama, LM Studio) to generate streaming explanations and repository documentation.
- Hermes powers questions, explanations, diagrams, documentation, analysis summaries and review briefs using their supplied repository context. Web explanations have no machine tools. Each request starts a fresh conversation, with a two-minute runtime budget and at most two concurrent requests; closing or cancelling an answer stops its Hermes process. Runtime startup can add a few seconds to the first response.
- **AI sketch** draws the current map, folder, file or architecture view using that connection. Sketches are checked with Mermaid before they are cached and displayed. **Static** returns to the original map; **AI sketch ✓** restores the cached sketch. Generated diagrams support **Copy Mermaid**, **Save SVG**, pan/zoom and file links. **Cancel sketch**, changing views, or opening another repository cancels an unfinished request. Hermes diagram requests use low reasoning without changing the saved chat configuration.
- Hermes owns its login and may save prompts/source in its session transcripts. Context is sent to the configured provider under its normal account usage limits. Existing API endpoint settings still work; API-mode keys stay in tab memory, are cleared on reload, and are never logged or written to the server's disk. Legacy saved keys are migrated out of localStorage. Hermes requests do not forward these browser keys.
- Developers can run `node scripts/hermes-web-smoke.mjs` after building to verify the HTTP integration against a real installed Hermes runtime and a local model fixture without external inference.

## Terminal setup

```sh
onboarder agent setup
onboarder agent model
onboarder agent doctor
onboarder
```

Or open `/model configure` in chat. If Hermes is missing, Onboarder offers a pinned official installer and verifies its hash before execution. Installation is explicit; Continue offline leaves repository browsing available.

The dedicated Onboarder profile preserves your normal Hermes profile. `/model` reads the installed Hermes catalog rather than hardcoding provider names. Provider subscriptions, usage limits, and data practices remain with that provider.

## Existing compatible endpoint

Set `ONBOARDER_AI_BASE_URL`, `ONBOARDER_AI_MODEL`, and optionally `ONBOARDER_AI_API_KEY` in your process environment before the first `agent setup`. The `OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_API_KEY` aliases are supported.

Do not paste real credentials into docs examples, chat questions, repository files, or public issue reports. API-mode browser keys live only in tab memory; Hermes mode uses the server-side Hermes login. These are separate credential paths.

## Offline explorer questions

`ask <question>` in the offline explorer uses a compatible endpoint only when requested. It sends the question and a limited scan summary. The process environment holds its API key; it is not written into Onboarder's config.
