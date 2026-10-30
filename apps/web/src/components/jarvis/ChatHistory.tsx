import { useState } from 'react';
import { X, Trash2, Pencil, Check, MessageSquarePlus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useChatThreads, useDeleteThread, useRenameThread } from '@/hooks/useChat';
import { fmtDate } from '@/lib/date';
import type { ChatThread } from '@/lib/types';

interface Props {
  activeId?: string;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onClose: () => void;
}

/** Saved conversations, newest first. Tap to reopen; rename or delete inline. */
export function ChatHistory({ activeId, onSelect, onNew, onClose }: Props) {
  const { data: threads, isLoading } = useChatThreads();
  const del = useDeleteThread();
  const rename = useRenameThread();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function startEdit(t: ChatThread) {
    setEditingId(t.id);
    setDraft(t.title);
  }
  async function commitEdit(id: string) {
    if (draft.trim()) await rename.mutateAsync({ threadId: id, title: draft });
    setEditingId(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <Card accent="surface" animate={false} className="max-h-[85vh] w-full max-w-sm overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <p className="display text-lg">Your chats</p>
            <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink">
              <X size={18} strokeWidth={3} />
            </button>
          </div>

          <Button
            variant="ink"
            className="mb-4 w-full"
            onClick={() => {
              onNew();
              onClose();
            }}
          >
            <MessageSquarePlus size={16} strokeWidth={2.5} /> New chat
          </Button>

          {isLoading ? (
            <p className="text-ink-3 text-sm font-semibold">Loading…</p>
          ) : !threads || threads.length === 0 ? (
            <p className="text-ink-2 text-sm font-medium leading-relaxed">
              No saved chats yet. Start a conversation and it will be saved here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {threads.map((t) => {
                const active = t.id === activeId;
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-2xl p-3"
                    style={{
                      background: active
                        ? 'color-mix(in srgb, var(--color-sys-blue) 20%, var(--color-sys-fill-2))'
                        : 'var(--color-sys-fill-2)',
                    }}
                  >
                    {editingId === t.id ? (
                      <>
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && commitEdit(t.id)}
                          className="min-w-0 flex-1 rounded-lg bg-sys-fill px-2 py-1 text-sm font-semibold outline-none"
                        />
                        <button
                          onClick={() => commitEdit(t.id)}
                          aria-label="Save name"
                          className="text-ink-3 hover:text-ink shrink-0"
                        >
                          <Check size={16} strokeWidth={3} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            onSelect(t.id);
                            onClose();
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-bold">{t.title || 'Untitled chat'}</p>
                          {t.lastMessageAt && (
                            <p className="text-ink-3 text-[11px] font-medium">
                              {fmtDate(t.lastMessageAt, 'd MMM, h:mm a')}
                            </p>
                          )}
                        </button>
                        <button
                          onClick={() => startEdit(t)}
                          aria-label="Rename"
                          className="text-ink-3 hover:text-ink shrink-0"
                        >
                          <Pencil size={14} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => del.mutate(t.id)}
                          disabled={del.isPending}
                          aria-label="Delete chat"
                          className="text-ink-3 hover:text-crit shrink-0"
                        >
                          <Trash2 size={15} strokeWidth={2.5} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
