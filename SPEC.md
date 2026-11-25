# ASCII Racer: the finished game

What the game is when it is done. The roadmap in `README.md` is the order it gets built in; `CLAUDE.md` says how the code works and how the loop works. Where this file is silent, pick the simplest thing that fits, and write it under "Decisions made along the way" at the bottom.

## The idea

A daily timed race through a generated city, the same route for everyone, one try. Like a daily word game: play once, see where you landed among everyone else, share it, come back tomorrow. Everything else (unlimited routes, lobbies, the garage) is there around it.

Desktop browsers with a keyboard. No accounts. The client is a static site.

## Main menu

Drawn in the glyph grid with the HUD's text layer, over a slow camera flight through today's city. Up/down and Enter, or the mouse.

```
ascii racer

daily
unlimited
join lobby
create lobby
garage
settings
```

## Routes

A route is a start, a list of checkpoints in order and a finish, all on the road network, generated from a seed.

- Built on the junction graph: a path that never uses the same road segment twice, with a share of turns so it isn't one straight line. Start and finish are mid-segment, not on a junction.
- Length is a target driving distance (`ROUTE_LENGTH`, about 60 to 90 seconds at a good pace), tunable.
- A checkpoint is a glowing gate across the road. Only the next one is lit; it counts when the car crosses its line in the right direction. The finish is a gate of its own colour.
- The player always knows where to go: the next gate is visible down the road, a minimap shows the route and the car, and an arrow in the HUD points at the next gate when it is off screen.
- A race is: countdown (3, 2, 1, go, the car held still), running (timer in ticks, shown as m:ss.mmm), finished. Race state is part of the simulation and reads the tick.
- Traffic lights and stop signs are scenery: nothing enforces them.

## Daily

- The day number is whole days since 2026-01-01 UTC. The city seed and the route come from the day number, with the default city settings, so everyone gets the same race. A new one at 00:00 UTC.
- One try. The try is used the moment the countdown starts: closing the tab, reloading or giving up counts as did not finish. After that the daily entry shows the result and a countdown to the next one.
- Before the start: a screen with the day number, a flyover of the route on the minimap, and "one try" said plainly.
- After the finish, the results screen:
  - the time, the rank and "faster than N% of players";
  - the bell curve: a histogram of every finished time today, drawn in glyphs, with a marker where the player is;
  - the top times with nicknames, and the player's own row;
  - share: copies a short text to the clipboard: the game's name, day number, time, percentile, a one-line glyph histogram with the player's bar marked, and the link. No spoilers of the route.
- Leaderboard and curve can be looked at only after the player's own try is used.

### Fair times

- The client never reports a time. It sends the inputs it recorded (one per tick) and the server runs the same simulation code on the same city and route and stores the time it gets. A run that doesn't reach the finish on the server is rejected.
- Identity is an anonymous sign-in kept in the browser, plus a nickname from settings (letters, digits, space, 3 to 12 characters, default `anon`). One run per identity per day, enforced by the database. Clearing the browser gives a new identity; that is accepted.
- Every run stores the simulation version it was driven with. A change to the simulation or to city generation bumps the version, and is only deployed together with the server.

### Backend

Supabase: Postgres for attempts and runs, row level security so the browser can only read finished results, Edge Functions (TypeScript, importing the game's own simulation code) to start an attempt and to check a run, anonymous sign-ins. Everything lives in `supabase/` as migrations and functions and is deployed by a GitHub Action when the repository has the secrets. The only runtime dependency the client may add is `@supabase/supabase-js`.

Without a backend (secrets missing, offline) the daily still plays; the results screen shows the time and says the leaderboard is unavailable.

## Unlimited

Random city seed, random route, as many times as you like. No leaderboard, nothing sent anywhere. The finish screen shows the time and offers: again (same route), next (new city and route), menu.

## Lobbies

- Create lobby: the host picks a few settings and gets a generated city and a short lobby code. Settings: seed (random by default, can be typed), city size (small 6×6, medium 8×8, large 10×10 blocks), downtown size, avenue density, route length (short, medium, long).
- Join lobby: type the code.
- Up to `MAX_PLAYERS` (8). Everyone drives freely in the city and sees the others with their garage car and nickname. The host starts a race: a random route, everyone placed on a start grid, countdown, a results board at the end, then free driving again. The host can start another route or change the settings (which regenerates the city for everyone).
- Cars collide with each other.
- Networking: Supabase Realtime for the lobby (who is in it, settings, signalling), then WebRTC data channels between the browsers. Players exchange inputs, each browser simulates everyone, with rollback when a late input arrives. If the host leaves, the lobby closes.
- Lobby races are not checked by a server and have no global leaderboard.

## Garage

- Pick a body shape and a colour. Several shapes (at least 5: for example coupe, hatchback, pickup, van, wedge), all inside the same collision box, all with the same physics. A hand-picked colour list (at least 12) that reads well at night.
- The car turns slowly on a lit spot while choosing.
- Saved in the browser, used in every mode, sent to other players in a lobby. It never affects times.

## Settings

Nickname, master volume and mute, glyph size (cell width), fullscreen, key bindings shown as a list. Saved in the browser.

## HUD

In the glyph grid, not HTML: speedometer, race timer, checkpoint count (`3/8`), minimap, arrow to the next gate. Hidden in the menu. The dev menu stays as it is, behind the backtick key.

## Sound

Engine, tires, impacts, a city hum, short sounds for countdown, checkpoint and finish. All made with Web Audio, no sound files.

## Release

- Hosted on GitHub Pages, deployed from `main` on every merge.
- First load shows the menu within a few seconds; a loading line while the city builds.
- Page title, description, social preview image and favicon.
- 60 fps in Chrome on a normal laptop at the default settings.
- The README says what the game is and how to play it.

## Not in the game

Accounts, chat, money, ads, AI traffic, car upgrades or stats, touch controls, weather.

## Decisions made along the way

(Added by the loop: one line each, with the roadmap step.)

- Step 13: the car starts on the middle junction of the city, not the origin, which is inside a block for some seeds.
- Step 14: the speedometer shows how fast the car is moving in any direction (sliding and reversing included), in km/h.
- Step 15: a route never uses a road segment twice but may pass through a junction again, crossing its own path.
- Step 15: routes never start on the ring road; ring segments are weighted down (0.3) and at most 3 come in a row.
- Step 15: a gate stands on every segment the route turns into and on straights at most 300 m apart; the finish is the last gate.
- Step 15: the start line has 30 m of clear road behind it for the start grid; the car starts one car length behind it on the centre line, facing along the road.
- Step 15: a route that can't be generated (city too small for the length) is an error, not a shorter route.
- Step 15: a gate is crossed by the car's centre point, moving from strictly behind its line to on or past it in one tick.
- Step 15: a gate counts across the whole road plus the pavement on both sides (3 m, up to the building line), so cutting a corner over the pavement still counts.
- Step 15: crossing a gate backwards or out of order does nothing: no penalty, the next gate stays next.
- Step 15: the countdown is 3 s and ignores all input; after the finish the time is frozen and the car keeps driving.
- Step 15: race time is whole ticks from go to the tick the finish is crossed in, shown as m:ss.mmm with the milliseconds rounded down.
- Step 15: gates are arches with glowing posts and a header whose panel is lit only on the side the route comes from; the next gate breathes and has a tall beam of light above it so it shows from 300 m; passed gates disappear, gates still to come stand unlit (dim, no glow, no beam), checkpoints are lime and the finish a white chequer with a pink-white beam.
- Step 15: the HUD guidance follows the route, not the line of sight, and says what a navigator would: between the last gate passed and the next one, the turn onto the next gate's leg (left or right) with the distance along the route to that junction, or, when that leg is reached by going straight, "GATE" with the distance along the route to the gate (never "straight"); only when the car is off those legs or not facing along one an orange "TO GATE" arrow pointing at the gate from where the player looks (ahead within 30°, behind beyond 135°). It sits beside the timer, not under it, so the next gate's beam straight ahead stays clear; the finish banner shows for 5 s, then only the frozen time stays.
- Step 15: the checkpoint count is gates passed over all gates with the finish counted as one (`12/12` once finished); the start line is not a gate. The timer has one minutes digit and stops at 9:59.983.
- Step 15: route lengths are short 1250 m, medium 1800 m (the daily), long 2500 m. The cautious test driver (grip only, about 22 m/s on average) takes 48–65 s, 70–94 s (80 on average) and about 110 s; a player who drifts through the turns should be some 10–20% faster, so medium lands around 65–80 s, inside the 60–90 s aim.
- Step 15: start and finish lines stay at least 20 m from the junction squares, and routes avoid turning the same way at two neighbouring junctions (looping round one block); both are preferences of the search, not hard rules.
- Step 16: the game opens on the menu; Enter goes menu → pre-race → race, Esc goes back to the menu from any other screen; nothing happens on Enter while racing.
- Step 16: the results screen comes up 5 s after the finish (when the finish banner has gone); until then the car can still be driven.
- Step 16: in the menu, pre-race and results screens the car takes no input; the world keeps ticking (signals, neon), the car stands on the middle junction in the menu and on the start line before the race.
- Step 16: the countdown starts when the pre-race screen is left with Enter, not when it opens.
- Step 16: regenerating the city from the dev menu goes back to the main menu.
- Step 16: the fly camera is switched only from the dev menu (the `C` key is gone) and works on every screen; the race restart key `R` is gone (restart comes back with unlimited's "again").
- Step 16: until the daily exists (step 17) the menu flies through the current city seed's city, not today's; the flight goes round a rectangle of roads two junctions out from the middle junction, 12 m up, at 8 m/s, and the parked car is hidden.
- Step 16: the menu selection wraps round at both ends; entries not built yet are shown dimmed and can be selected, but Enter or a click on them does nothing; the selection starts on the first built entry.
- Step 16: in the menu the mouse is not captured; pointing at an entry selects it and a click picks it.
- Step 16: `unlimited` goes from the menu straight to the countdown in a new random city (seed 1 to 1 000 000, default city settings, medium route with the route seed the city seed); no pre-race screen, that one is the daily's. A seed whose city can't hold a route is skipped for another, at most 10, then the game stays on the menu (from the finish screen's `next`: goes to the menu).
- Step 16: unlimited's finish screen shows the time in big digits where the menu has its title, and `again`, `next`, `menu` in a list like the menu's (keys and mouse the same way, the mouse released); `again` is selected first; Esc goes to the menu. `again` restarts the same route straight into a new countdown.
- Step 16: unlimited writes its seed into the city settings the dev menu edits, so the dev menu's info line shows it (the seed slider doesn't move); the other city settings are whatever the dev menu holds, the defaults for players.
