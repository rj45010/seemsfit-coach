import { motion } from 'framer-motion';
import { DataRunner, DataText } from '@/components/DataRunner';

/**
 * Loading skeleton that mirrors the Today layout (greeting, pills, rings, nutrition,
 * chips, summary, yesterday). The big cards read "Syncing your data" with a small
 * data-runner so the wait feels purposeful, not empty. Uses theme tokens so it
 * follows dark/light automatically. Cross-fades out as the real home mounts.
 */
function Box({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`bg-sys-fill animate-pulse flex items-center justify-center rounded-2xl ${className}`}>
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: string }) {
  return <DataText text={children} className="text-ink text-2xl" />;
}

export function HomeSkeleton() {
  return (
    <motion.div
      className="bg-paper page-x fixed inset-0 z-50 overflow-hidden pt-[calc(env(safe-area-inset-top)+0.5rem)]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <div className="mx-auto w-full max-w-2xl">
        {/* greeting + date */}
        <div className="mb-3 flex items-baseline justify-between">
          <Box className="h-8 w-52 rounded-xl" />
          <Box className="h-4 w-20 rounded-md" />
        </div>
        {/* water + steps pills */}
        <div className="flex items-center gap-2">
          <Box className="h-10 w-40 rounded-full" />
          <Box className="ml-auto h-10 w-28 rounded-full" />
        </div>
        {/* rings card */}
        <Box className="mt-4 h-44 w-full rounded-3xl">
          <CardLabel>Syncing</CardLabel>
        </Box>
        {/* nutrition card */}
        <Box className="mt-4 h-32 w-full rounded-3xl">
          <CardLabel>your</CardLabel>
        </Box>
        {/* action chips */}
        <div className="mt-4 flex gap-2">
          <Box className="h-9 w-28 rounded-full" />
          <Box className="h-9 w-28 rounded-full" />
          <Box className="h-9 w-24 rounded-full" />
        </div>
        {/* daily summary */}
        <Box className="mt-4 h-24 w-full rounded-3xl">
          <CardLabel>data</CardLabel>
        </Box>
        {/* yesterday card → small data-runner */}
        <Box className="mt-4 h-40 w-full rounded-3xl">
          <DataRunner />
        </Box>
      </div>
    </motion.div>
  );
}
