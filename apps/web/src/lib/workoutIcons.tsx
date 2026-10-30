/**
 * Custom workout glyphs — one per Apple Fitness activity type, inspired by
 * Apple's icons but drawn in this app's stroke style (currentColor, round caps)
 * so History is recognisable by image alone. Each is API-compatible with a
 * lucide icon: it accepts { size, strokeWidth, className }.
 */
import type { ReactNode, ReactElement, SVGProps } from 'react';

export type WorkoutIcon = (props: { size?: number; strokeWidth?: number; className?: string }) => ReactElement;

function make(paths: ReactNode): WorkoutIcon {
  return function Icon({ size = 24, strokeWidth = 2, className }: { size?: number; strokeWidth?: number; className?: string }) {
    const p: SVGProps<SVGSVGElement> = {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className,
    };
    return <svg {...p}>{paths}</svg>;
  };
}

export const WORKOUT_ICONS: Record<string, WorkoutIcon> = {
  // Strength / functional
  'Traditional Strength Training': make(<><line x1="3" y1="12" x2="21" y2="12" /><rect x="4" y="8" width="2.5" height="8" rx="0.8" /><rect x="17.5" y="8" width="2.5" height="8" rx="0.8" /><rect x="7" y="9.5" width="1.5" height="5" /><rect x="15.5" y="9.5" width="1.5" height="5" /></>),
  'Functional Strength Training': make(<><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0" /><path d="M7.5 14a4.5 4.5 0 0 1 9 0 1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 7.5 14z" /></>),
  'Cross Training': make(<><path d="M5 5l14 14" /><path d="M19 5L5 19" /><circle cx="5" cy="5" r="1.4" /><circle cx="19" cy="5" r="1.4" /><circle cx="5" cy="19" r="1.4" /><circle cx="19" cy="19" r="1.4" /></>),
  Gymnastics: make(<><circle cx="8" cy="15" r="3.5" /><circle cx="16" cy="15" r="3.5" /><line x1="8" y1="3" x2="8" y2="11.5" /><line x1="16" y1="3" x2="16" y2="11.5" /></>),
  Climbing: make(<><path d="M3 20l6-11 4 6 2-3 6 8z" /><path d="M9 9V3l3 1.5L9 6" /></>),
  Bouldering: make(<><circle cx="12" cy="13" r="8" /><circle cx="9" cy="11" r="1" /><circle cx="14.5" cy="10.5" r="1" /><circle cx="13" cy="16" r="1" /></>),

  // Core
  'Core Training': make(<><rect x="7" y="4" width="10" height="16" rx="4" /><line x1="12" y1="7" x2="12" y2="17" /><line x1="9" y1="9.5" x2="15" y2="9.5" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="14.5" x2="15" y2="14.5" /></>),

  // HIIT
  'High Intensity Interval Training': make(<path d="M13 2L4 14h6l-1 8 9-12h-6z" />),
  'Jump Rope': make(<><path d="M6 5v6a6 6 0 0 0 12 0V5" /><circle cx="6" cy="4" r="1.3" /><circle cx="18" cy="4" r="1.3" /></>),
  'Step Training': make(<><rect x="4" y="13" width="16" height="5" rx="1" /><path d="M8 13v-3M16 13v-3" /></>),
  'Stair Stepper': make(<path d="M3 19h4v-4h4v-4h4v-4h6" />),
  'Mixed Cardio': make(<><path d="M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11" /><path d="M11 12h2l1-2 1.5 4 1-2H21" /></>),

  // Running
  'Outdoor Run': make(<><path d="M3 16h13l4-2c0-2-2-3-4-3l-3-3-2 3H6a3 3 0 0 0-3 3z" /><line x1="3" y1="18.5" x2="20" y2="18.5" /></>),
  'Indoor Run': make(<><rect x="3" y="16" width="16" height="2.4" rx="1.2" /><path d="M16 16V6h4" /><circle cx="6" cy="13.5" r="1.2" /><path d="M7 16l5-3" /></>),
  'Trail Running': make(<><path d="M3 19l5-8 4 6 3-5 6 7z" /><path d="M6 19q3.5-3 7 0t7 0" strokeDasharray="1 2.5" /></>),
  'Track & Field': make(<><rect x="3" y="8" width="18" height="8" rx="4" /><rect x="6.5" y="10" width="11" height="4" rx="2" /></>),

  // Cycling
  'Outdoor Cycling': make(<><circle cx="6" cy="16.5" r="3.2" /><circle cx="18" cy="16.5" r="3.2" /><path d="M6 16.5l4-7h6l-4 7M10 9.5h6" /></>),
  'Indoor Cycling': make(<><circle cx="7" cy="16" r="3.2" /><path d="M7 16l4-8M11 8h5M16 8v8" /><circle cx="18" cy="16" r="2" /></>),
  'Hand Cycling': make(<><circle cx="8" cy="17" r="4" /><circle cx="8" cy="17" r="1" /><path d="M12 7h3l2 6M8 13l4-6" /></>),

  // Walking
  'Outdoor Walk': make(<><path d="M8 4c1.4 0 2 2 2 4.5S9.4 14 8 14s-2-3-2-5.5S6.6 4 8 4z" /><path d="M16 9c1.4 0 2 2 2 4.5S17.4 19 16 19s-2-3-2-5.5S14.6 9 16 9z" /></>),
  'Indoor Walk': make(<><path d="M9 4c1.6 0 2.4 2.4 2.4 5.5S10.6 16 8.8 16 6.4 12.6 6.4 9.5 7.4 4 9 4z" /><circle cx="14" cy="6" r="0.9" /><circle cx="15.5" cy="9" r="0.9" /><circle cx="14.5" cy="12" r="0.9" /></>),
  Elliptical: make(<><circle cx="6" cy="15" r="2" /><circle cx="18" cy="15" r="2" /><path d="M7.5 14l4.5-5 4.5 5M12 9V5" /></>),
  Rowing: make(<><path d="M3 17c4 2.2 14 2.2 18 0" /><path d="M5 14l13-6M15 6l3 1-1 3" /></>),
  'Wheelchair Walk Pace': make(<><circle cx="10" cy="17" r="4" /><path d="M10 7a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z" /><path d="M9 9l1 5h5l2 4M9 11h4" /></>),
  'Wheelchair Run Pace': make(<><circle cx="12" cy="17" r="4" /><path d="M12 7a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z" /><path d="M11 9l1 5h5M11 11h4" /><path d="M3 9h3M3 13h2" /></>),

  // Hiking
  Hiking: make(<path d="M7 4v9l-2.2 1c-1.2.6-1 3.2 1 3.2h11a3 3 0 0 0 3-3c0-2-3-3-5-4l-3-2V4z" />),

  // Swimming / water
  'Pool Swim': make(<><path d="M3 9q3-2 6 0t6 0 3 0" /><path d="M3 14q3-2 6 0t6 0 3 0" /><path d="M3 19q3-2 6 0t6 0 3 0" /></>),
  'Open Water Swim': make(<><circle cx="8" cy="8" r="2" /><path d="M10 9l5 3" /><path d="M3 15q3-2 6 0t6 0 3 0" /><path d="M3 20q3-2 6 0t6 0 3 0" /></>),
  'Water Fitness': make(<><path d="M7 7h10M7 5v4M17 5v4" /><path d="M3 16q3-2 6 0t6 0 3 0" /><path d="M3 20q3-2 6 0t6 0 3 0" /></>),
  'Water Polo': make(<><circle cx="12" cy="8" r="4" /><path d="M3 17q3-2 6 0t6 0 3 0" /><path d="M3 21q3-2 6 0t6 0 3 0" /></>),
  'Water Sports': make(<><path d="M3 15q4-6 9-3t9-3" /><path d="M3 20q3-2 6 0t6 0 3 0" /></>),
  Surfing: make(<><path d="M4 20c5 0 7-2 10-8s4-7 5-7" /><path d="M3 20q3-2 6 0t6 0 3 0" /></>),
  Sailing: make(<><path d="M12 3v12M12 4l6 11H12M5 18h14l-2 3H7z" /></>),
  Paddling: make(<><path d="M3 15c3 3 15 3 18 0" /><path d="M9 13l8-8M15 3l3 1-1 3" /></>),
  Kayaking: make(<><path d="M4 14c3 2 13 2 16 0" /><path d="M5 5L19 19M7 4l-2 2 2 2M19 16l-2 2 2 2 2-2z" /></>),

  // Yoga / mind & body
  Yoga: make(<><circle cx="12" cy="6" r="2" /><path d="M12 9v4M12 13c-4 0-6 2-7 5h14c-1-3-3-5-7-5z" /></>),
  Pilates: make(<><path d="M4 16h16M6 16v-2M18 16v-2" /><circle cx="8" cy="10" r="1.5" /><path d="M9.5 11l5 2 4-1" /></>),
  Barre: make(<><line x1="3" y1="7" x2="21" y2="7" /><path d="M6 7v10M18 7v10" /><circle cx="12" cy="12" r="2" /></>),
  Flexibility: make(<><path d="M5 19c2-9 12-9 14 0" /><circle cx="5" cy="19" r="1.3" /><circle cx="19" cy="19" r="1.3" /></>),
  Cooldown: make(<><path d="M3 9h11a2 2 0 1 0-2-2" /><path d="M3 13h15a2 2 0 1 1-2 2" /></>),
  'Mind & Body': make(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />),
  'Tai Chi': make(<><circle cx="12" cy="12" r="9" /><path d="M12 3a4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 1 0 9 9 9 0 0 0 0-18z" /></>),

  // Dance / fitness
  Dance: make(<><path d="M9 18V6l10-2v10" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="14" r="2" /></>),
  'Cardio Dance': make(<><circle cx="7" cy="17" r="2" /><circle cx="16" cy="15" r="2" /><path d="M9 17V7l9-2v10M9 9l9-2" /></>),
  'Fitness Gaming': make(<><rect x="3" y="9" width="18" height="8" rx="4" /><path d="M6.5 13h3M8 11.5v3" /><circle cx="15.5" cy="12.5" r="0.8" /><circle cx="17.5" cy="14.5" r="0.8" /></>),

  // Ball & court sports
  Basketball: make(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5.3 5.3c3 3 3 10.4 0 13.4M18.7 5.3c-3 3-3 10.4 0 13.4" /></>),
  Soccer: make(<><circle cx="12" cy="12" r="9" /><path d="M12 8l3.2 2.3-1.2 3.9h-4l-1.2-3.9z" /></>),
  'American Football': make(<><ellipse cx="12" cy="12" rx="9" ry="5" /><path d="M9 12h6M11 10v4M13 10v4" /></>),
  'Australian Football': make(<><ellipse cx="12" cy="12" rx="5" ry="9" /><path d="M12 5v14" /></>),
  Rugby: make(<><ellipse cx="12" cy="12" rx="8" ry="5" transform="rotate(-30 12 12)" /><path d="M10 14l4-4" /></>),
  Hockey: make(<><path d="M5 4v11c0 2 2 3 4 3h7" /><ellipse cx="18" cy="18" rx="2" ry="1" /></>),
  Volleyball: make(<><circle cx="12" cy="12" r="9" /><path d="M12 3a14 14 0 0 0 0 18M3.6 9c5 1 11 5 13.8 11M20.4 9c-5 1-11 5-13.8 11" /></>),
  Baseball: make(<><circle cx="12" cy="12" r="9" /><path d="M6 6c2.2 2 2.2 10 0 12M18 6c-2.2 2-2.2 10 0 12" /></>),
  Softball: make(<><circle cx="8" cy="8" r="4" /><path d="M11 11l10 10M18 16l3 3" /></>),
  Cricket: make(<><path d="M7 4l4 4-7 9-3-1z" /><circle cx="17" cy="15" r="2.5" /></>),
  Tennis: make(<><circle cx="9" cy="9" r="5" /><path d="M12.6 12.6L20 20" /><circle cx="18" cy="7" r="1.5" /></>),
  'Table Tennis': make(<><circle cx="10" cy="9" r="5" /><path d="M13.5 12.5L18 18" /><circle cx="17" cy="6" r="1" /></>),
  Badminton: make(<><circle cx="8" cy="16" r="2.5" /><path d="M10 14l6-9M10 14l8-5M10 14l4 1" /></>),
  Squash: make(<><ellipse cx="10" cy="8" rx="4" ry="5" /><path d="M12 13l6 7" /></>),
  Racquetball: make(<><circle cx="10" cy="9" r="5" /><path d="M13.5 12.5l5 6" /></>),
  Pickleball: make(<><rect x="6" y="4" width="9" height="11" rx="4" /><path d="M11 15l5 5" /><circle cx="18" cy="7" r="1" /></>),
  Padel: make(<><rect x="6" y="4" width="9" height="11" rx="4" /><circle cx="9" cy="8" r="0.6" /><circle cx="12" cy="8" r="0.6" /><circle cx="10.5" cy="11" r="0.6" /><path d="M11 15l5 5" /></>),
  Handball: make(<><circle cx="15" cy="9" r="4" /><path d="M4 20c0-3 2-5 5-5M5 12v4M8 11v4M11 12v3" /></>),
  Lacrosse: make(<><path d="M6 20L16 6" /><path d="M14 3a4 4 0 0 1 4 5l-4 1z" /></>),
  Golf: make(<><path d="M8 4v14M8 4l8 2-8 3" /><ellipse cx="12" cy="19" rx="6" ry="2" /></>),
  'Disc Sports': make(<><ellipse cx="12" cy="12" rx="9" ry="4" /><ellipse cx="12" cy="11" rx="5" ry="2" /></>),
  Bowling: make(<><circle cx="9" cy="15" r="4" /><circle cx="8" cy="14" r="0.7" /><circle cx="10" cy="13.5" r="0.7" /><path d="M17 4c1 0 1.5 1 1.5 3s-.5 9-1.5 9-1.5-7-1.5-9 .5-3 1.5-3z" /></>),

  // Combat
  Boxing: make(<path d="M7 8a4 4 0 0 1 8 0v3h2a2 2 0 0 1 0 4h-2v2a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" />),
  Kickboxing: make(<><path d="M8 9a3 3 0 0 1 6 0v2h2a1.5 1.5 0 0 1 0 3h-2v2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" /><path d="M18 5l3-2M19 9l3-1" /></>),
  'Martial Arts': make(<><path d="M4 10h16v3H4z" /><path d="M9 13l-3 7 4-2 1-5M15 13l3 7-4-2-1-5" /></>),
  Wrestling: make(<><circle cx="8" cy="6" r="2" /><circle cx="16" cy="6" r="2" /><path d="M8 8c0 4 8 4 8 0M6 14l4-3 4 3 4-2" /></>),
  Fencing: make(<><path d="M3 21L20 4M16 5l3 3M5 19l2 2" /></>),

  // Snow & ice
  'Downhill Skiing': make(<><path d="M5 18l12-12M7 20l12-12" /><circle cx="14" cy="5" r="1.5" /></>),
  'Cross Country Skiing': make(<><path d="M4 19l8-8M9 20l9-9" /><path d="M14 4l3 3M6 17l2 2M16 11l2 2" /></>),
  Snowboarding: make(<><ellipse cx="12" cy="12" rx="3" ry="10" transform="rotate(45 12 12)" /><circle cx="9" cy="10" r="0.8" /><circle cx="15" cy="14" r="0.8" /></>),
  Skating: make(<><path d="M8 4v11M5 19h14M6 17v2M18 17v2" /><path d="M8 15c-2 0-3 1-3 2M8 15c2 0 4 1 5 2" /></>),
  'Snow Sports': make(<path d="M12 2v20M4 7l16 10M20 7L4 17M12 6l-3-2M12 6l3-2M12 18l-3 2M12 18l3 2" />),

  // Outdoor & misc
  Equestrian: make(<><path d="M7 4c-2 2-3 5-3 8a8 8 0 0 0 16 0c0-3-1-6-3-8" /><circle cx="7" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></>),
  Hunting: make(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 12l8-8M16 4h4v4" /></>),
  Fishing: make(<><path d="M3 12c4-5 12-5 16 0-4 5-12 5-16 0z" /><path d="M19 12l3-2v4z" /><circle cx="8" cy="11" r="0.8" /></>),
  Play: make(<><circle cx="12" cy="12" r="2" /><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></>),
  Other: make(<path d="M3 12h4l3 7 4-14 3 7h4" />),
};
