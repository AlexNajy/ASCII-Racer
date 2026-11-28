# Driftle: the finished game

What the game is when it is done. The roadmap in `README.md` is the order it gets built in; `CLAUDE.md` says how the code works and how the loop works. Where this file is silent, pick the simplest thing that fits, and write it under "Decisions made along the way" at the bottom.

## The idea

A daily timed race through a generated city, the same route for everyone, one try. Like a daily word game: play once, see where you landed among everyone else, share it, come back tomorrow. Everything else (unlimited routes, lobbies, the garage) is there around it.

Desktop browsers with a keyboard. No accounts. The client is a static site.

The game is called **driftle**. That is the name a player sees everywhere: the menu title, the page title, the share text, the social preview, the README's heading. "ASCII Racer" is only the working name of the repository and the code.

## Main menu

Drawn in the glyph grid with the HUD's text layer, over a slow camera flight through today's city. Up/down and Enter, or the mouse.

```
driftle

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
- Step 16: volume is 11 steps, 0 to 10 (default 8), stored apart from mute; nothing plays until sound exists (step 18).
- Step 16: a nickname is typed as letters (A to Z, either case), digits and spaces, at most 12; on saving, spaces at the ends are dropped and runs of spaces become one, and it must then be 3 to 12 characters, else it stays being typed with the rule shown. Typing starts from the current name.
- Step 16: on the settings screen Esc cancels a nickname being typed, otherwise goes back to the menu with `settings` selected; while typing, no other key acts (the dev menu's backtick included) and the mouse does nothing.
- Step 16: glyph size is the dev menu's cell width (4 to 16 CSS px, default 6): both change the same value and both save it; the URL parameter `cell=` wins and is never saved. Fullscreen is shown and switched there but not saved (browsers only allow it on a key press or click).
- Step 16: settings are saved in `localStorage` as they change; a stored value that is missing, of the wrong type or out of range falls back to its default; without storage (private mode) the game runs with the defaults. Shots (`shot` or `tick` in the URL) neither read nor write it.
- Step 16: the garage offers five shapes, `coupe` (the old car, the default), `hatchback`, `pickup`, `van` and `wedge`, and twelve colours, `ember` (the old red, the default), `tangerine`, `gold`, `lime`, `jade`, `teal`, `sky`, `cobalt`, `violet`, `magenta`, `rose` and `silver`; they are stored by these names, which never change. All shapes fit the same collision box with their wheels in the same spots; nothing but the drawing knows the shape, so it never affects times.
- Step 16: the garage is its own small dark scene, not a spot in the city: the car turns slowly (one turn in 16 s) on a glowing floor disc under its own light, seen from a fixed camera a little above, headlights off; `GARAGE` at the top and the two rows (shape, colour) in a panel at the bottom, so the car stays clear in the middle. Left/Right or the `<` `>` arrows change a row, every change is saved at once and shows on the car straight away; Esc goes back to the menu with `garage` selected.
- Step 16: while a city builds (first load, `unlimited`, `next`) the screen is black with one line, `building city...`, in the middle; no percentage (generation is one blocking call). `again` builds nothing and shows no loading line.
- Step 16: Enter and Esc do nothing while the loading line is up; keys pressed while the city builds arrive once it is ready, where Enter does nothing in the countdown and Esc goes back to the menu. The countdown starts after the build, at its full 3 s.
- Step 17: the daily's city seed is `1 + blockSeed(day ^ salt, attempt) % 1 000 000` (the same range as unlimited), so neighbouring days give unrelated cities; its route seed is the city seed, medium length, default city settings.
- Step 17: a day whose city can't hold a route falls to attempt 1, 2... (up to 20, then an error); none of days 0 to 999 needs it.
- Step 17: days before 2026-01-01 UTC have negative numbers and work the same.
- Step 17: the game starts in today's city (read once from the clock), so the menu flies through it; after an unlimited race the menu keeps flying through the last loaded city instead of reloading today's.
- Step 17: a run's input log holds one input per tick from go (the first tick whose input is read) to the tick the finish is crossed in, so its length is the race time; the countdown is not in it.
- Step 17: inputs are logged as the keyboard makes them (throttle, brake, drift on or off, steer left, none or right: 24 combinations, all possible with the keys, so all accepted); a log can't hold anything analogue.
- Step 17: a run longer than the timer's 9:59.983 (35 999 ticks) is not valid; a packed log is then at most 36 003 bytes, 48 004 characters as base64url text.
- Step 17: the server's replay accepts a run only if the finish is crossed on the log's last tick: a log that ends before the finish, or goes on after it, is rejected.
- Step 17: a log has exactly one valid encoding (shortest lengths, no split runs, no padding); any other form is rejected, not repaired.
- Step 17: the simulation version counts changes to what a city seed, route seed and input log produce; it is a plain integer, and a test fingerprints the stored reference values (free-driving hashes with city digest, driven race, packed log and its format version, route digests, daily seeds and routes) against a table `version -> fingerprint` kept as history. A bump without changed values is refused, so every version has a distinct fingerprint.
- Step 17: the daily entry is the menu's first; the menu opens on it while today's try is open, on `unlimited` once it is used. Esc or `menu` from an unlimited screen comes back to the menu with `unlimited` selected, from a daily screen with `daily`.
- Step 17: the try is kept in `localStorage` (only the latest day's: day, status started / finished / did not finish, time, packed input log, simulation version) and written as started before the countdown's first tick; a started try found later (reload, closed tab, crash) did not finish. Without storage the daily still plays and the try lives in memory until the page closes; unreadable storage counts as no try.
- Step 17: Esc in the daily race does not end the try: it shows `give up? this is your one try   enter: give up   esc: keep driving` while the race keeps running (no pause, which would let a player stop the clock to plan); only Enter gives up. With the mouse captured, Chrome uses the first Esc to release it and may not pass it to the game, so it can take one more Esc. After the finish Esc goes straight to the results.
- Step 17: a daily race past the timer's 9:59.983 did not finish; the finish is stored at the finishing tick, so closing the tab during the finish banner keeps the time.
- Step 17: the day a daily race belongs to is fixed when its pre-race screen opens; finishing after midnight UTC counts for that day, and the next day's daily is open after it.
- Step 17: a stored try from a later day than the clock says (clock set back) stays the one shown, with its result and the countdown to the day after it; nothing is overwritten and no day gets a second try. A try from today stored with another simulation version still counts as used.
- Step 17: the daily is driven with the default car settings and built from the default city settings whatever the dev menu holds.
- Step 17: the pre-race screen shows `DAILY 330` and `ONE TRY` in big letters, a panel saying the try is used when the countdown starts and leaving counts as did not finish, the route's length and gate count, the keys, and the route on the minimap with a marker running it from start to finish at 240 m/s, waiting 1 s on the finish, looping; behind it the car on the start line from the chase camera.
- Step 17: the daily results show the time (or `DID NOT FINISH`) in big letters, the day, `leaderboard unavailable` and `next daily in hh:mm:ss` (whole seconds rounded up), with one entry, `menu`; when the countdown reaches zero the line says `new daily ready` and the entry becomes `play`, which opens the new daily. A did-not-finish or reopened result has the menu's flight behind it, a fresh finish the car rolling on.
- Step 17: a stored try more than 1 day (`MAX_DAYS_AHEAD`) ahead of the clock counts as no try, so the daily is open and the next start replaces it.
- Step 17: a write to the stored try never replaces a further one: a finished run is never overwritten by a start, a give-up or a second finish from any tab (the first stored finish wins).
- Step 17: Enter on the pre-race screen reads the stored try again; if another tab used today's try meanwhile, it goes to the results instead of the countdown. A tab still racing when another tab's finish is stored can drive on, but its results show the stored finish.
- Step 17: a page loaded with a daily `state` or any of the URL parameters `gate`, `car`, `tick`, `shot`, `drive`, `dnf`, `giveup`, `next` keeps the daily's try in memory only, never reading or writing storage.
- Step 17: the give-up question is drawn on every grid at least 8 columns wide (clipped on the top row if nothing else fits); narrower, or outside the glyph render modes, Esc doesn't ask. Enter gives up only after a frame has shown the question.
- Step 17: a hidden tab stops the race and its clock (the browser stops drawing frames, and time is counted in ticks); accepted, nothing detects it.
- Step 17: the database has three tables keyed by identity and day: `attempts` (the try is used), `runs` (a checked finish: ticks, nickname, simulation version) and `run_logs` (the inputs, apart so no browser can read and resend another player's). Only the service role writes; a signed-in browser reads its own attempts and the runs of days it has an attempt for; nobody else reads anything.
- Step 17: the database checks what it stores (ticks 1 to 35 999, the nickname rule, a log of base64url text up to 48 004 characters); a test keeps those numbers equal to the game's.
- Step 17: the local Supabase stack uses ports 544xx so it runs beside other local projects; sign-ups stay enabled because anonymous sign-ins count as sign-ups, email and phone sign-in are off.
- Step 17: the server decides the day: an attempt can be started only for the server's today, or for yesterday in the first 5 minutes after 00:00 UTC (a pre-race screen opened just before midnight); a run can be sent on its day or the day after, so a late finish or a dropped connection still counts.
- Step 17: a run is accepted only from the identity of a verified sign-in that has an attempt for that day, with the server's simulation version and a valid nickname (not corrected by the server); nothing in the request claims a time. A second send answers with the time already stored and changes nothing.
- Step 17: the server does not tie a run to its attempt in time: after starting, an identity can send any finishing log until the end of the next day. Accepted, since a new identity costs nothing either; what the server guarantees is that every time on the board was really driven on that day's route.
- Step 17: a run that doesn't finish on the server stores nothing and can be sent again; giving up or not finishing is recorded only in the browser.
- Step 17: the functions check tokens with the auth server (no gateway check, so the browser's preflight passes) and answer JSON with a reason for every refusal.
- Step 17: on a merge to `main` the backend deploys first (migrations, then the functions, then the auth settings the game needs: anonymous sign-ins on, email off, sign-ups on; then a check that creates nothing), and the site builds only if that succeeded, so the site is never newer than its server. Without all three secrets every backend step skips and the site deploys as before. A manual run on another branch does nothing.
- Step 17: the site gets the project's address and publishable key (else the legacy anon key) at build time; both are public by design. Pull requests run a read-only dry run of the migration push against the hosted project.
- Step 17: the browser signs in anonymously the first time the daily is opened (that is also when the backend library is loaded, never at startup), starts the attempt when the countdown starts and sends the run at the finish, all in the background: the game never waits for the network. Giving up or not finishing sends nothing.
- Step 17: a finished run that was not sent (offline, tab closed) is sent the next time the daily is opened, while the server still takes it (its day or the day after). A failure that may pass (no network, a server error) is tried again after 2, 5, 10, 20 and 40 s while the daily is open; a refusal is final and kept with the try.
- Step 17: the results show one status line of fixed width: `sending run...`, `run recorded`, `game updated: reload` (the server runs a newer simulation) or `leaderboard unavailable` (no backend, offline, did not finish, refused). Once stored, the time shown is the server's.
- Step 17: a build without the backend's address, and any page loaded with a dev URL parameter that changes races, makes no request and loads no backend code.
- Step 17: the results come from one database function, answered only to a signed-in player with an attempt for that day (nothing otherwise, not even the count): the number of finished runs, the player's time, rank and how many were slower, the ten fastest with nicknames, and a histogram. No identities or timestamps leave the database.
- Step 17: rank is one more than the number of strictly faster runs, so equal times share a rank; the top list is ordered by time, then by who finished first. Runs of every simulation version of a day share one board.
- Step 17: the histogram has 48 equal buckets from the fastest time to the 95th percentile (at least 48 ticks wide); slower runs are counted in the last bucket, so a few very slow runs don't flatten the curve.
- Step 17: "faster than N%" counts the other players: runs strictly slower over all runs but the player's own, rounded down; not shown when the player is the only one.
- Step 17: with a board, the results show the time, `daily #N`, `#114 of 300   faster than 62% of players`, the histogram and the top times side by side, the countdown and the entries; the player is pink everywhere (time, bar, `^ you`, row). A player alone gets `the first to finish today`; an empty day `no finished runs yet`. Without a board the screen is the plain one with its status line.
- Step 17: the histogram's bars are glyph columns (`_`, `=`, `#` for a third, two thirds and a full cell), scaled to the tallest; under 1000 runs neighbouring buckets are drawn summed in pairs so a small day still reads as a curve. The axis says the fastest time and the cap with a `+` (it holds everything slower).
- Step 17: the top list shows ten rows (five on small grids); a player outside it gets their own row under `...`, with the nickname from the settings. Without a run of their own (did not finish) the board has no marker, rank or percentile.
- Step 17: the board is fetched when the results open, again when the run is stored, and every 60 s while the screen is open; a failed fetch keeps what is shown. Smaller windows drop the top list, then the histogram, then show rank and percentile as plain lines.
