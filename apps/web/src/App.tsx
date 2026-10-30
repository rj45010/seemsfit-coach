import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { useTodayMetrics, useMetricsRange } from '@/hooks/useMetrics';
import { AppBg } from '@/components/ui/AppBg';
import { AppShell } from '@/components/shell/AppShell';
import { ScrollRestoration } from '@/components/shell/ScrollRestoration';
import { HomeSkeleton } from '@/components/HomeSkeleton';
import Login from '@/routes/Login';
import Rejected from '@/routes/Rejected';
import Terms from '@/routes/Terms';
import TermsGate from '@/components/auth/TermsGate';
import Today from '@/routes/Today';
import Train from '@/routes/Train';
import Health from '@/routes/Health';
import Profile from '@/routes/Profile';
import Nutrition from '@/routes/Nutrition';
import Trends from '@/routes/Trends';
import MetricDetail from '@/routes/MetricDetail';
import WorkoutDetail from '@/routes/WorkoutDetail';
import Labs from '@/routes/Labs';
import LabDetail from '@/routes/LabDetail';
import Goals from '@/routes/Goals';
import Journal from '@/routes/Journal';
import Records from '@/routes/Records';
import NotFound from '@/routes/NotFound';

const SKELETON_MAX_MS = 4000; // never hold the skeleton longer than this
const GRACE_MS = 250; // if data lands within this, skip the skeleton entirely (instant)

export default function App() {
  const { status } = useAuth();
  // Warm the home's primary data so a cached open is ready almost immediately.
  const today = useTodayMetrics();
  const range = useMetricsRange(60);

  const [timedOut, setTimedOut] = useState(false);
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setGraceOver(true), GRACE_MS);
    const b = setTimeout(() => setTimedOut(true), SKELETON_MAX_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const native = Capacitor.isNativePlatform();
  const dataReady = today.isFetched && range.isFetched;
  const loading = status === 'unknown' || (status === 'authed' && !dataReady);

  // Skeleton only after the grace window — a cached/fast open never shows it.
  const showSkeleton = native && !timedOut && graceOver && loading;
  // During grace while still loading, hold a plain themed background (no flash).
  const graceBlank = native && !timedOut && !graceOver && loading;
  const renderRouter = !showSkeleton && !graceBlank;
  const s = status === 'unknown' ? 'authed' : status;

  return (
    <>
      <AnimatePresence>{showSkeleton && <HomeSkeleton key="skeleton" />}</AnimatePresence>
      {graceBlank && <div className="bg-paper fixed inset-0 z-50" />}
      {renderRouter && (
        <BrowserRouter>
          <ScrollRestoration />
          <AppBg>
            <Routes>
              <Route
                path="/login"
                element={s === 'authed' ? <Navigate to="/" replace /> : <Login />}
              />
              <Route path="/rejected" element={<Rejected />} />
              <Route path="/terms" element={<Terms />} />

              {s === 'authed' ? (
                <Route element={<TermsGate />}>
                <Route element={<AppShell />}>
                  <Route index element={<Today />} />
                  <Route path="train" element={<Train />} />
                  <Route path="health" element={<Health />} />
                  <Route path="trends" element={<Trends />} />
                  <Route path="trends/:metric" element={<MetricDetail />} />
                  <Route path="workouts" element={<Navigate to="/train" replace />} />
                  <Route path="workouts/:id" element={<WorkoutDetail />} />
                  <Route path="plans" element={<Navigate to="/train" replace />} />
                  <Route path="plans/:id" element={<Navigate to="/train" replace />} />
                  <Route path="labs" element={<Labs />} />
                  <Route path="labs/:id" element={<LabDetail />} />
                  <Route path="goals" element={<Goals />} />
                  <Route path="nutrition" element={<Nutrition />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="journal" element={<Journal />} />
                  <Route path="records" element={<Records />} />
                  <Route path="chat" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
                </Route>
              ) : (
                <Route
                  path="*"
                  element={
                    <Navigate to={s === 'rejected' ? '/rejected' : '/login'} replace />
                  }
                />
              )}
            </Routes>
          </AppBg>
        </BrowserRouter>
      )}
    </>
  );
}
