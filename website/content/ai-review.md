Contextual AI review is optional. It retrieves relevant repository evidence, asks your configured model for actionable issues, and validates returned citations before showing findings.

## Start a review

```sh
onboarder review . --ai
onboarder review . --staged --ai --json
onboarder review . --base main --head feature --ai --sarif
```

In **Review**, select **AI-assisted · selected source**, configure **AI connection**, and run the review. Progress shows collection, reasoning and validation. **Cancel** stops the request. Static results remain available if the requested AI pass is incomplete.

Without `--ai`, no model request occurs. An explicitly requested pass with no provider reports that state instead of claiming a complete AI review.

## Choose your provider

Reuse an existing compatible endpoint and model. For a local model already installed in your endpoint:

```sh
export ONBOARDER_AI_BASE_URL=http://127.0.0.1:11434/v1
export ONBOARDER_AI_MODEL=YOUR_INSTALLED_MODEL
onboarder review . --ai
```

Supply `ONBOARDER_AI_API_KEY` privately through your environment only when required. `OPENAI_BASE_URL`, `OPENAI_MODEL` and `OPENAI_API_KEY` aliases remain supported. Endpoint/model flags override environment and existing user settings. No specific commercial model, subscription or hosted Onboarder account is required.

For an existing Hermes profile:

```sh
onboarder agent model
onboarder review . --ai --ai-connection hermes
```

The contextual Hermes bridge has no repository tools. Browser credentials do not replace its stored login. See [optional AI setup](/docs/ai/) for the separate chat and API credential paths.

## Cross-file context

Changed symbols and added lines lead retrieval. Import/dependency graphs and the optional TypeScript semantic engine provide callers, references, relevant tests, discoverable routes and architecture boundaries. An authentication change can therefore include its callers and tests when relationships are statically available.

Excerpts carry paths, line ranges, revisions and source hashes. Staged and committed sources come from captured index/Git objects. The model receives bounded excerpts rather than the whole repository. JavaScript and TypeScript have the strongest support; unavailable semantic relationships and conservative language fallbacks remain visible.

## Evidence and confidence

Findings need a valid changed-line anchor, exact supporting quotes and source ranges. Unsupported files, hallucinated ranges, malformed responses and unsupported cross-file claims are rejected. Overlapping static/AI findings are deduplicated.

**Evidence validated** means citations were checked. Confidence is model-stated, not a calibrated probability or proof of execution behavior. **Show AI explanation** displays stored reasoning without another request.

## Limits and cost

| Control | Default |
| --- | --- |
| Context | 60,000 UTF-8 bytes, 20 excerpts, up to 30 changed files |
| Requested output | 3,000 tokens |
| Deadline | 60 seconds |
| Requests | One per pass, no automatic retries; three admissions per minute per repository/process |

CLI controls include `--ai-max-context-bytes`, `--ai-max-excerpts`, `--ai-max-changed-files`, `--ai-max-tokens`, `--ai-timeout-ms` and `--ai-max-requests-per-minute`. The web exposes context and output limits. Exact ranges and additional caps are in the [version-pinned guide](https://github.com/Amitpandey88/onboarder/blob/v1.1.0/docs/CONTEXTUAL_AI_REVIEW.md#limits-privacy-and-permissions).

API usage is shown when the provider supplies receipts. Hermes has byte/time/concurrency bounds but its bridge does not enforce output-token limits or provide token receipts. Unavailable usage does not mean zero cost.

## Privacy and limitations

Repository comments, documents and model output are untrusted. Fixed instructions, bounded retrieval, redaction, tool-free reasoning and citation checks reduce prompt-injection consequences; they cannot prove reasoning true. Review never executes repository code or enables GitHub writes.

Provider failure, cancellation, truncation and changed source remain failed, partial or stale. Published tests use mocked model responses; live model quality is not established. Read [Data and privacy](/docs/data-privacy/) before sending confidential source.
