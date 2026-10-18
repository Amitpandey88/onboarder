## Static diagrams

The repository map and pre-generated diagrams work offline. **Atlas** collects diagrams across folders and components. Use **Copy Mermaid** to take editable text into a renderer; **Save SVG** is available for generated diagrams that expose it.

In the explorer:

```text
diagram
layers-diagram
atlas
docs
```

In chat:

```text
/diagram src/auth.ts
/layers-diagram
/atlas
/docs src/auth.ts
```

Pass real paths from your repository. File and folder diagrams draw from the current scan; rescan after structural edits.

## AI sketches in the web UI

Configure **AI connection**, then choose **AI sketch** for the current map, folder, file, or architecture view. Onboarder checks returned Mermaid before caching and displaying it. **Static** returns to the original map; **AI sketch ✓** restores a cached sketch.

Generated diagrams support copy, SVG export, pan/zoom, and file links. Cancel sketch, switching views, or loading another repository cancels an unfinished request. Hermes sketch requests use low reasoning without changing the saved chat configuration.

A generated diagram is a model interpretation of supplied context. Verify connections against the static graph and source before using it as an architecture specification.

## Repository documentation

The tool's **Docs** tab describes the loaded repository; this website's `/docs` describes Onboarder itself. Offline `docs` and `/docs` produce repository prose. Use an explicit write option when you want a file created:

```text
/docs src/auth.ts --write
```

Explorer docs can write `ONBOARDER.md`. Inspect the generated output before committing it. AI-generated documentation uses your configured connection and sends the relevant repository context; local explanations remain available without AI.
