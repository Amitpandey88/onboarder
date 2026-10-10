import { CHAT_COMMANDS, commandGroup } from './commands.js';
import { terminalText } from '../agent/process.js';

export interface SearchChoice { value: string; label: string; detail?: string }
export const FILE_ACTIONS = [
  { value: 'show', label: 'Read source', detail: 'Line numbers and a file summary' },
  { value: 'inspect', label: 'Inspect this file', detail: 'Role, exports, complexity and findings' },
  { value: 'deps', label: 'Trace connections', detail: 'Imports and the files that depend on this one' },
  { value: 'graph', label: 'Explore its graph', detail: 'Follow the dependency tree' },
  { value: 'blast', label: 'See change impact', detail: 'What may be affected if this file changes' },
  { value: 'explain', label: 'Explain locally', detail: 'Understand the module without AI' },
] as const;
export interface FileSelection { path: string; action: typeof FILE_ACTIONS[number]['value'] }

/** Rank contiguous matches first, then ordered character matches for paths. */
export function searchChoices<T extends SearchChoice>(choices: readonly T[], query: string): T[] {
  const terms = terminalText(query).trim().toLowerCase().replace(/^\//, '').split(/\s+/).filter(Boolean);
  if (!terms.length) return [...choices];
  const score = (choice: T) => {
    const label = terminalText(choice.label).toLowerCase().replace(/^\//, '');
    const value = terminalText(choice.value).toLowerCase().replace(/^\//, '');
    const detail = terminalText(choice.detail || '').toLowerCase();
    let total = 0;
    for (const term of terms) {
      if (label === term || value === term) total += 1000;
      else if (label.startsWith(term) || value.startsWith(term)) total += 600;
      else if (label.includes(term) || value.includes(term)) total += 350;
      else if (detail.includes(term)) total += 200;
      else {
        let offset = 0, gaps = 0;
        const text = value + ' ' + label;
        for (const char of term) {
          const next = text.indexOf(char, offset);
          if (next < 0) return -1;
          gaps += next - offset; offset = next + char.length;
        }
        total += Math.max(1, 100 - gaps);
      }
    }
    return total;
  };
  return choices.map((choice, index) => ({ choice, index, score: score(choice) }))
    .filter(item => item.score >= 0).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.choice);
}

export function commandChoices(): SearchChoice[] {
  const first = ['map', 'open', 'tour', 'find', 'review', 'model', 'resume'];
  return [...CHAT_COMMANDS].sort((a, b) => {
    const ai = first.indexOf(a[0]), bi = first.indexOf(b[0]);
    return (ai < 0 ? first.length : ai) - (bi < 0 ? first.length : bi);
  }).map(([name, usage, summary]) => ({ value: name, label: '/' + name + (usage ? ' ' + usage : ''), detail: commandGroup(name) + ' · ' + summary }));
}

export function fileChoices(files: readonly string[]): SearchChoice[] {
  return [...new Set(files)].sort((a, b) => a.localeCompare(b)).map(file => {
    const display = terminalText(file).replace(/[\r\n\t]/g, ' ');
    return { value: file, label: display.split('/').at(-1) || display, detail: display };
  });
}
