import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import { todayKey } from './date';

const BASE = import.meta.env.VITE_FUNCTIONS_BASE as string;

/**
 * Uploads a lab PDF to Storage, creates the labs/{id} doc (status: pending),
 * then asks the parseLab function to extract markers. Returns the lab id.
 * Parsing failure is non-fatal — the doc remains pending/failed for retry.
 */
export async function uploadLabPdf(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('not_authenticated');

  const ref = doc(collection(db, `users/${user.uid}/labs`));
  const path = `labs/${user.uid}/${ref.id}.pdf`;

  await uploadBytes(storageRef(storage, path), file, { contentType: 'application/pdf' });
  await getDownloadURL(storageRef(storage, path)); // warms the URL

  await setDoc(ref, {
    uploadedAt: serverTimestamp(),
    reportDate: todayKey(),
    pdfStoragePath: path,
    status: 'pending',
  });

  // Fire-and-forget parse (function may not be deployed yet).
  try {
    const token = await user.getIdToken();
    await fetch(`${BASE}/jarvisParseLab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ labId: ref.id }),
    });
  } catch {
    /* parsing happens later; doc stays pending */
  }

  return ref.id;
}

export async function pdfUrl(path: string): Promise<string> {
  return getDownloadURL(storageRef(storage, path));
}
