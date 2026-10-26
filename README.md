# TypeFast

A touch-typing tutor for phones (best sideways, works upright too) and desktop. Right after it
opens it offers **full screen** with one big button (there is also a Full screen button in the top
bar and in the menu). On a phone held upright it first asks you to rotate, or you can continue in portrait.

## Practice

- **☰ Menu** → **Typing Practice** opens a full page with the five parts as cards in the middle;
  pick one to see its lessons:
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
- Key sounds and full screen.

## Phone keyboard

- **Phone held upright:** you type with your phone's own keyboard. Tap the text to open it.
- **Sideways or desktop:** the on-screen keyboard shows the next key to press. If you type
  letters on a real keyboard (OTG, Bluetooth or laptop), it hides itself; the phone's volume
  buttons don't count. Turn it back on from the keyboard button. While Shift is on, it turns blue.

## Car Race

**☰ Menu → Games → Car Race.**

1. **Customise your car** — 7 cars (from photos in `public/cars/`) and 13 paints. A paint is laid
   only on the car's body panels, keeping the photo's light and shade; "Original" keeps its colour.
2. Enter your name, then:
   - **PLAY** — race alone.
   - **Create game** — makes a room with a **6-letter password** and a link (`/race#PASSWORD`).
   - **Join game** — type the password. Opening the link works too; friends also pick their car first.
3. In the room the host picks the length (15, 30, 50 words or a custom 5–300) and starts. After a
   3-second countdown everyone types the same text; each car moves as its player types.
4. Results show places, speed and accuracy — and everyone **stays in the room**. The host taps
   **Race again**; nobody needs a new link or to connect again. People can join any time
   (mid-race they watch and join the next race), up to **8 players**.
5. **✕ Quit** asks first. A player can leave any time; when the host leaves the room closes for everyone.

**Chat:** the room has a chat with emoji and quick reactions (docked beside the lobby on wide
screens, 💬 in the top bar otherwise, with an unread count). Messages are encrypted with AES-GCM
using a key made from the room password, so only the players can read them; the host passes them
on still sealed. The password stays after `#` in the link, which browsers never send to a server,
and the game server only sees a hash of it. (On a plain-`http` page — like a phone opening your
computer's LAN address — browsers have no WebCrypto, so chat there is protected only by WebRTC's
own encryption.)

During a race, if nobody types for 60 seconds the race ends by itself.

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

- `components/` — `TypingApp` (menu, Typing Practice and Games pages, results), `TypingSession`
  (typing screen), `Keyboard`, `RaceApp` (car race screens), `Chat`, `Car`, `Shell` (full screen,
  launch and rotate prompts).
- `lib/` — `lessons.ts` (lessons and random text), `cPrograms.ts`, `progress.ts` (best scores),
  `sound.ts` (sounds and settings), `race.ts` (race rooms), `cars.ts` (cars and painting),
  `secure.ts` (room password, chat encryption).
- `app/page.tsx` is the tutor, `app/race/page.tsx` the race.

Add a lesson by adding an entry to `SECTIONS` in `lib/lessons.ts`; add a C program to
`C_PROGRAMS` in `lib/cPrograms.ts`.

Add a car by putting a 480×180 transparent `<id>.webp` (car facing right, tyres on the bottom
edge) and a `<id>-paint.png` mask (white where the body paint is) in `public/cars/`, then adding
it to `CAR_MODELS` in `lib/cars.ts`.
