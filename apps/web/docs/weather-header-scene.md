# Weather-driven header scene (deferred plan)

Goal: extend the Today header's time-of-day scene so it also reflects **real local weather**
(sunny / partly-cloudy / overcast / fog / rain / snow / thunderstorm), layered with time of day —
like a weather app's animated backdrop. Time-of-day scene (sun/moon/birds/stars) ships first; this
is the follow-up.

## Data source
- **Open-Meteo** (`https://api.open-meteo.com/v1/forecast?...&current=weather_code,is_day`) —
  free, **no API key**, generous limits. Returns a **WMO weather code** + `is_day` (0/1).
- Fetch on app open + refresh every ~1–2h via React Query (`staleTime`), cached. Graceful fallback
  to time-of-day-only when offline / on error.

## Location (pick when we build)
- **IP-based (no permission):** approximate city-level via a geo-IP lookup. Zero friction. Good
  enough for a header mood. Preferred to start.
- **Device location (precise):** `@capacitor/geolocation`, one-time permission prompt. More exact,
  more friction + a plugin. Weather data stays client→API only (don't persist to Firestore).

## Condition mapping (WMO code → scene)
| Condition (WMO) | Scene |
|---|---|
| Clear (0) – day | sun + slow rays; birds in the morning |
| Clear (0) – night | crescent moon + twinkling stars |
| Mainly clear / partly cloudy (1–2) | sun/moon + 1–2 drifting clouds |
| Overcast (3) | soft clouds, muted flat light |
| Fog (45,48) | low haze wash |
| Drizzle / rain (51–67, 80–82) | clouds + falling rain streaks (density by intensity) |
| Snow (71–77, 85–86) | clouds + drifting snow dots |
| Thunderstorm (95–99) | dark clouds + occasional lightning flash |

All tinted by **time of day** (dawn warm → midday bright → dusk rose → night cool, from `is_day` +
`timeVariant()`), confined to the header band, low-opacity, reduced-motion aware, paused when
backgrounded.

## Build shape
- `features/weather/` module: `useWeather()` hook → `{ condition, isDay }` (Zod-validated Open-Meteo
  payload), colocated fetch, React Query key `['weather', lat, lon]`.
- Extend the existing `features/ambient/TimeScene.tsx` (or a `<WeatherScene>`) with a sprite set:
  sun, moon, clouds, rain, snow, birds, stars, lightning. One renderer switched by condition + isDay.
- Reuse `timeVariant()` for the tint.

## Notes / cost
- Adds one network call + (maybe) a location permission.
- The **scene art is the real work** (~7 conditions × day/night). Build condition-by-condition.
- Battery: keep sprite counts low, CSS/rAF only, pause offscreen — minimal impact.
