import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, orderBy, query, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import type { ChatThread, ChatMessage } from '@/lib/types';

export function useChatThreads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['threads', user?.uid],
    enabled: !!user,
    queryFn: async (): Promise<ChatThread[]> => {
      const q = query(
        collection(db, `users/${user!.uid}/chats`),
        orderBy('lastMessageAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatThread);
    },
  });
}

/** Delete a saved conversation and all its messages. */
export function useDeleteThread() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      const base = `users/${user!.uid}/chats/${threadId}`;
      const msgs = await getDocs(collection(db, `${base}/messages`));
      const batch = writeBatch(db);
      msgs.forEach((m) => batch.delete(m.ref));
      batch.delete(doc(db, base));
      await batch.commit();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['threads', user?.uid] }),
  });
}

/** Rename a saved conversation's title. */
export function useRenameThread() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, title }: { threadId: string; title: string }) => {
      await setDoc(doc(db, `users/${user!.uid}/chats/${threadId}`), { title: title.trim() }, { merge: true });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['threads', user?.uid] }),
  });
}

export function useChatMessages(threadId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['messages', user?.uid, threadId],
    enabled: !!user && !!threadId,
    queryFn: async (): Promise<ChatMessage[]> => {
      const q = query(
        collection(db, `users/${user!.uid}/chats/${threadId}/messages`),
        orderBy('createdAt', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
    },
  });
}
