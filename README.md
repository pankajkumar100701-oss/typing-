# TypeFast

A touch-typing tutor for phones (best sideways, works upright too) and desktop. On a phone held
upright it first asks you to rotate, or you can continue in portrait.

## Practice

- **☰ Menu** with five parts:
  - **Basic** — learn each key row by row, from F and J to Space and Shift.
  - **Experienced** — real words, capitals, numbers and punctuation.
  - **Advance** — sentences, paragraphs and symbols.
  - **Test** — type as much as you can in 1, 2, 3, 5 or 10 minutes.
  - **C Programs** — type real C code; Enter starts a new line and indentation is added for you.
- Pick how many words a text has (20, 30, 50, 70, 100 or your own number).
- Every lesson builds a **new random text** each time; sentences are mostly freshly made, so they rarely repeat.
- Smooth gliding caret, **Backspace** to fix mistakes; correct letters turn green, wrong ones red.
- Speed colours: under 30 wpm red, 30–49 yellow, 50+ green.
- A **result page** after each text: speed, accuracy, raw speed, time, correct/wrong letters,
  mistakes and your best speed for that lesson (saved in the browser).
- Key sounds (on/off) and fullscreen.

## Phone keyboard

An on-screen keyboard shows the next key to press and works when the phone is held upright or
sideways. If you type letters on a real keyboard (OTG, Bluetooth or laptop), it hides itself;
the phone's volume buttons don't count. Turn it back on from the keyboard button.

## Car Race

Race your friends, up to **8 players**:

1. Open **Car Race** from the menu, enter your name and make a race link.
2. Share the link. Friends open it, enter a name and join before the race starts.
3. The host picks the length (15, 30, 50 words or a custom 5–300) and starts. After a 3-second
   countdown everyone types the same text; each car moves as its player types.
4. A wrong letter shows in red like in lessons, and your car stops at it until you fix it with
   Backspace. You finish only when every letter is right.
5. Results show places, speed and accuracy.

**One link = one race.** The link closes when:

- the race is over (the results stay on screen; the host can make a new link),
- nobody starts the race within **10 minutes** (the lobby shows a countdown, then "Session timed out"),
- the host closes the page or it goes to sleep for about 15 seconds.

During a race, if nobody types for 60 seconds the race ends by itself. Opening a closed link
says it has expired, and nobody can join a race that has already started.

Races run browser-to-browser over WebRTC ([PeerJS](https://peerjs.com/)); PeerJS's free public
server only connects the players, so there's no account, key or backend. Notes:

- The host's tab keeps the room, so the host should keep it open and on screen.
- Friends need the deployed site's link; a `localhost` link only works on your own computer.
- Some strict office or school networks block WebRTC.

## Run

```bash
npm install
npm run dev    # http://localhost:3000
npm run build
npm start
```

Built with Next.js 16 and React 19.

## Code

- `components/` — `TypingApp` (menu, results), `TypingSession` (typing screen), `Keyboard`,
  `RaceApp` (car race screens).
- `lib/` — `lessons.ts` (lessons and random text), `cPrograms.ts`, `progress.ts` (best scores),
  `sound.ts` (sounds and settings), `race.ts` (race rooms).
- `app/page.tsx` is the tutor, `app/race/page.tsx` the race.

Add a lesson by adding an entry to `SECTIONS` in `lib/lessons.ts`; add a C program to
`C_PROGRAMS` in `lib/cPrograms.ts`.
