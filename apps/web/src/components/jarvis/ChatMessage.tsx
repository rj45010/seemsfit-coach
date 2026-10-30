import ReactMarkdown from 'react-markdown';

interface Props {
  role: 'user' | 'jarvis';
  content: string;
  pending?: boolean;
  createdAt?: number;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ChatBubble({ role, content, pending, createdAt }: Props) {
  const isUser = role === 'user';

  // User turns stay compact bubbles (right-aligned). Vyom's reply is full-width editorial
  // text on the background — no bubble — so it reads as "talking to a coach", not texting.
  if (isUser) {
    return (
      <div className="flex flex-col items-end">
        <div
          className="max-w-[85%] rounded-3xl px-3.5 py-2.5 text-sm font-semibold leading-relaxed whitespace-pre-wrap"
          style={{
            background: 'color-mix(in srgb, var(--color-sys-blue) 20%, var(--color-surface))',
            borderBottomRightRadius: 4,
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-ink-3 text-[10px] font-bold uppercase tracking-wide">Vyom</span>
        {createdAt && <span className="text-ink-3 text-[10px] font-medium">{fmtTime(createdAt)}</span>}
      </div>
      <div className="jarvis-md text-[15px] leading-relaxed">
        <ReactMarkdown>{content}</ReactMarkdown>
        {pending && <span className="text-ink-3 ml-0.5 animate-pulse">▋</span>}
      </div>
    </div>
  );
}
