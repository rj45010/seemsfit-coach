import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';

export default function NotFound() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card accent="sky" className="text-center">
        <h1 className="big-number mb-2 text-5xl">404</h1>
        <p className="text-ink-2 mb-4 text-sm font-medium">That page wandered off.</p>
        <Link to="/" className="text-ink text-sm font-bold underline">
          Back to Today
        </Link>
      </Card>
    </div>
  );
}
