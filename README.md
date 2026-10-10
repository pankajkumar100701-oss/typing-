# TypeFast

A touch-typing tutor built for phones held in **landscape** (works on desktop too).

- **☰ Menu** with three levels: **Basic** (home, top, bottom row), **Standard** (words, capitals,
  numbers, punctuation) and **Advance** (sentences, paragraphs, symbols).
- Every lesson builds a **new random text** each time it starts.
- Smooth gliding caret, **Backspace** to fix mistakes; correct letters turn green, wrong ones red.
- Speed colours: under 30 wpm red, 30–49 yellow, 50+ green.
- A **result page** after each text: speed, accuracy, raw speed, time, correct/wrong letters,
  mistakes and your best speed for that lesson (saved in the browser).

```bash
npm run dev    # http://localhost:3000
npm run build
```

Code: `components/` (`TypingApp`, `TypingSession`, `Keyboard`) and `lib/` (`lessons.ts`, `progress.ts`).
Add a lesson by adding an entry to `LEVELS` in `lib/lessons.ts`.
