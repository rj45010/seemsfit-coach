import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { auth, signOut } from '@/lib/firebase';

export default function Rejected() {
  const navigate = useNavigate();

  async function returnToSender() {
    await signOut(auth);
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card accent="lavender" className="w-full max-w-md text-center">
        <img
          src="/icons/logo.png"
          alt="seemsfit"
          className="mx-auto mb-5 h-16 w-16 rounded-3xl object-cover"
          style={{ boxShadow: 'var(--shadow-3)' }}
        />
        <h1 className="display mb-3 text-xl">We're no longer accepting new sign-ins.</h1>
        <p className="text-ink-2 mb-7 text-sm font-medium leading-relaxed">
          SeemsFit has transitioned to invite-only personal access.
        </p>
        <Button variant="surface" onClick={returnToSender}>
          Return to sender
        </Button>
      </Card>
    </div>
  );
}
