Click Search or press `Cmd/Ctrl+K` to find files, symbols, and file
contents. Arrow keys select results; Enter opens them and `Cmd/Ctrl+Enter`
opens the source. `Alt+Left/Right` switches result kinds. Tab moves between
dialog controls; Escape clears the query, then closes. Filters such as
`path:src ext:ts render` can be removed using their chips.

Search reuses the scan's symbol index, combines rapid keystrokes, and displays
bounded previews with exact local match counts. Graph animation pauses outside
the Graph tab, while search is open, and when the browser tab is hidden. Review
filters update the findings without rebuilding the surrounding workspace.

## Query examples

```text
path:src ext:ts render
ext:rs -test
"exact phrase"
/resolve[A-Z]\w*/
```

Search uses the scan's index. A supported file must have been included in the scan to appear. Use path and extension filters to narrow a large result set; remove filter chips to broaden it again.

## In the terminal

Use `find <query>` in the offline explorer or `/find <query>` in chat. Ctrl-O or `/open [query]` searches indexed code files by path, then opens an action menu. Ctrl-P searches commands by name or topic; it fills the composer before execution so you can add arguments.

An ambiguous short filename lists candidates instead of choosing silently. Quote file paths containing spaces. Completion follows the active workspace; after switching repositories, old file completions stay hidden until the new repository is indexed.

## In these docs

Press Cmd/Ctrl-K or `/` to open documentation search. Search titles, section headings, command names, and guide text. Arrow keys move between results, Enter opens one, and Escape closes the search. The index is fetched from this website; your query stays in the browser.
