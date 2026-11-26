# Release 0.46.0 — micro-interactions

State: **deployed** 2026-11-26 to `studbook-luann` (gru), revision `0bcb483e350f0f8acc0f0507e47ca75898bfb3ff`. Pre-deploy backup `20261126T175028Z` (SHA256 `5a0a8a3f…fb70`, matched on the machine), restore tested: 11 accounts, 348 horses, 0 problems.

## Changes (`assets/micro.js`)

- **The balance answers:**
  - When the guineas change, the number rolls to its new value, and the pill glows green for a gain or red for a loss.
  - A "+₲ 120" or "−₲ 35" chip floats off it.
  - On a real gain (₲ 20 or more), gold coins arc from wherever the player last clicked into the purse, with a small clink sized to the gain (when sound is on).
- **Presses:** every button and tab answers with a soft ripple from the exact point of the press and a slight push-in. Brass buttons catch the light on hover. Horse cards are left alone: they draw their gold frame outside the box and keep their own foil and tilt.
- **Tabs:** a brass bar slides under the current tab.
- **Elite rise:** when a horse moves up into "near elite" or "stakes class", a toast arrives with a stamped seal ("ELITE" or "STAKES") and the sentence in Portuguese. Toasts in general now slide in.
- **Reduced motion:** the balance just changes, with no chip, coins, ripples or sliding bar.

## How it stays cheap

The page's Portuguese translation watches every text change and re-sweeps the page. To avoid waking it 60 times a second:

- the rolling digits come from a `data-roll` attribute drawn through CSS;
- the coins share one canvas.

The real balance is always in the DOM text, so screen readers and tests read the true number.

## Tests

- `tests/browser/micro.spec.mjs`:
  - running meetings rolls the balance and floats the change, the text holds the real balance, and nothing is left painted over it;
  - the tab bar lands under the clicked tab;
  - a press ripples from the pointer;
  - reduced motion shows no chip or coins;
  - an elite rise is stamped in Portuguese.
