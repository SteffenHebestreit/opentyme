import { Fragment, ReactNode } from 'react';

/**
 * Minimal, safe Markdown for assistant replies: paragraphs, line breaks,
 * "-"/"*"/"1." lists, **bold**, *italic*, `code` and ### headings.
 *
 * Builds React elements only — no HTML is ever injected, so model output can't
 * smuggle markup or scripts into the page.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={key} className="rounded bg-black/[0.06] px-1 py-px font-mono text-[0.85em] dark:bg-white/10">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'h'; text: string };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ type: 'p', lines: [] });
    } else if (heading) {
      blocks.push({ type: 'h', text: heading[1] });
    } else if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)![1];
      if (last && (last.type === 'ul' || last.type === 'ol') && last.type === type) last.items.push(text);
      else blocks.push(type === 'ul' ? { type: 'ul', items: [text] } : { type: 'ol', items: [text] });
    } else if (last && last.type === 'p') {
      last.lines.push(line);
    } else {
      blocks.push({ type: 'p', lines: [line] });
    }
  }
  return blocks.filter((b) => b.type !== 'p' || b.lines.length > 0);
}

export function MarkdownText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === 'h') {
          return (
            <p key={i} className="font-semibold">
              {renderInline(block.text, `h${i}`)}
            </p>
          );
        }
        if (block.type === 'ul' || block.type === 'ol') {
          const List = block.type;
          return (
            <List key={i} className={block.type === 'ul' ? 'list-disc space-y-0.5 pl-5' : 'list-decimal space-y-0.5 pl-5'}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, `l${i}-${j}`)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line, `p${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
