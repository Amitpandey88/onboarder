## API scope

These endpoints belong to an installed Onboarder workspace server. They are not hosted on the public documentation site. The routes below are extracted from the current router and are an implementation reference rather than a separate long-term API compatibility promise.

In local mode, Host, Origin, and Fetch-Site checks protect the server. In self-hosted mode, remote clients need a valid signed browser session or `Authorization: Bearer <access-key>`. A same-origin website does not become authorized to arbitrary filesystem reads by changing URL parameters.

## Scan request

```http
POST /api/scan
Content-Type: application/json

{
  "path": "/absolute/path/to/repository",
  "options": {
    "maxFiles": 10000,
    "maxFileSize": 524288,
    "readConcurrency": 4
  }
}
```

The body is validated. Limits use UTF-8 bytes and include maximums listed in [Analysis](/docs/analysis/). Server-backed source reads and related queries refer to the returned scan session; do not treat it as a global path capability. Deleting the scan session triggers cleanup, including temporary clone storage.

## Routes

{{routes}}

`GET /api/health` is the server health endpoint. Authentication endpoints include status, login, and logout; settings responses mask credentials. Key rotation invalidates old access keys and sessions.

## Streaming and external work

AI explanations and analyzer operations can stream events. Closing or cancelling a request should stop the related operation. Optional AI uses the configured provider and external engines may fetch packages or rules; these are explicit operations rather than effects of a plain repository scan.

For stable automated repository summaries use [one-shot JSON reports](/docs/reports/). For agent integration use the structured [MCP tools](/docs/mcp-reference/). Inspect the source handlers before building a client for payloads not documented here.


## Review and fix authorization

Contextual review is explicitly requested through the review endpoint. Finding-linked proposal/apply/check/re-review actions extend `/api/intelligence/fix`; source/session/path-bound approval is enforced server-side. `POST /api/triage` provides owner-only list, inspect and optional explanation. These operations retain Host/Origin/session rules and never accept a browser-supplied arbitrary filesystem root. Inspect the version-pinned source contracts before building a client; review or patch approval alone does not grant command execution.
