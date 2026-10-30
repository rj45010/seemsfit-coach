import { useEffect, type ReactNode } from 'react';
import { Card } from './Card';
import { Button } from './Button';

/** A simple modal explaining what a metric means and how to read it. */
export function InfoSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  // Lock the page behind the modal so it can't scroll under the blur.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <Card accent="surface" animate={false} className="max-h-[80vh] w-full max-w-sm overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>
          <p className="display mb-2 text-lg">{title}</p>
          <div className="text-ink-2 space-y-2 text-sm font-medium leading-relaxed">{children}</div>
          <Button variant="ink" className="mt-4" onClick={onClose}>
            Got it
          </Button>
        </div>
      </Card>
    </div>
  );
}
