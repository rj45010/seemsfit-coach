import html2canvas from 'html2canvas';

/**
 * Render a node to a transparent PNG blob. html2canvas with backgroundColor:null
 * produces TRUE transparency (html-to-image filled white on iOS Safari).
 */
async function nodeToPngBlob(node: HTMLElement, backgroundColor: string | null = null): Promise<Blob | null> {
  // iOS bug: html2canvas captures before web fonts finish loading, producing an
  // image with NO text. Wait for fonts (and one frame) so glyphs are ready.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* non-fatal */
    }
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const canvas = await html2canvas(node, {
    backgroundColor, // null = transparent; pass a colour for a solid card
    scale: 3, // crisp on retina + social
    useCORS: true,
    allowTaint: true,
    logging: false,
  });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Plain browser download of a PNG (goes to Files on iOS). */
export async function downloadNodeAsPng(node: HTMLElement, filename: string, backgroundColor: string | null = null): Promise<void> {
  const blob = await nodeToPngBlob(node, backgroundColor);
  if (blob) triggerDownload(blob, filename.endsWith('.png') ? filename : `${filename}.png`);
}

/**
 * Open the native share sheet with the PNG so the user can "Save Image" to
 * Photos or post straight to a story. Falls back to download.
 */
export async function shareOrDownloadPng(node: HTMLElement, filename: string, backgroundColor: string | null = null): Promise<void> {
  const blob = await nodeToPngBlob(node, backgroundColor);
  if (!blob) return;
  const name = filename.endsWith('.png') ? filename : `${filename}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user dismissed
    }
  }
  triggerDownload(blob, name);
}
