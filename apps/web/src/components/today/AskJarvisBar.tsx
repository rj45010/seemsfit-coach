import { Pill } from '@/components/ui/Pill';
import { HScroll } from '@/components/ui/HScroll';
import { useJarvis } from '@/components/jarvis/jarvisContext';
import { useEntitlement } from '@/hooks/useEntitlement';

const DO = [
  { label: 'Log a meal', seed: 'Log a meal: ', pro: true }, // AI food logging — Pro only
  { label: 'Log workout', seed: 'Log a workout: ' },
  { label: 'Set a goal', seed: 'Help me set a goal: ' },
  { label: 'Weekly review', seed: 'Give me my weekly review' },
];

/** Quick-log chips on Today. Full Jarvis lives in the bottom nav centre. */
export function AskJarvisBar() {
  const { openJarvis } = useJarvis();
  const { isPro } = useEntitlement();
  const items = DO.filter((d) => isPro || !d.pro);
  return (
    <HScroll className="bleed-x flex gap-2 pb-1">
      {items.map((d) => (
        <span key={d.label} className="shrink-0">
          <Pill tone="butter" active onClick={() => openJarvis(d.seed)}>
            {d.label}
          </Pill>
        </span>
      ))}
    </HScroll>
  );
}
