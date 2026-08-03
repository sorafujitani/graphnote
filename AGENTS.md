<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Canvas behaviour tests

Editor bugs in this repo are geometric — a handle whose hit area is clipped, a
drop target that is a few pixels wide, a card that stops being draggable. Those
never fail in a DOM shim, so the canvas is tested in real Chromium.

| Command                 | Runs                                              |
| ----------------------- | ------------------------------------------------- |
| `pnpm test`             | everything: `node` project + `browser` project    |
| `pnpm run test:browser` | canvas only, real Chromium (`*.browser.test.tsx`) |
| `pnpm run test:node`    | logic only, happy-dom (fast inner loop)           |
| `pnpm run test:setup`   | once per machine: downloads the Chromium build    |

## Rules

- **Touching `src/react-app/components/Note.tsx`, the canvas wiring in
  `src/react-app/pages/GraphEditor.tsx`, or any `.react-flow__*` / `.note-*` CSS
  means running `pnpm run test:browser`.** Type-check and lint say nothing about
  hit testing.
- Anything the user describes as "feels off", "hard to hit", "sometimes does
  nothing" belongs in `src/react-app/pages/GraphEditor.browser.test.tsx` as a
  failing test first.
- Use the harness in `src/react-app/test/canvas.tsx`: `mountEditor` renders the
  real editor with `fetch` stubbed, then `cardBox` / `cardElement` / `fieldBox` /
  `portBox` / `portCenter` give live geometry and `dragMouse` presses, travels,
  and releases through whatever sits under the cursor. Assertions read from the
  recorded API calls (`api.createdEdges`, `api.matching("PATCH", "/nodes/n1")`),
  so a gesture that looks right but sends nothing still fails.
- Focus, typing, and blur need trusted events: use `userEvent` from
  `vite-plus/test/browser/context`. A `userEvent.click` also fails when something
  overlays the target, which is a useful signal on its own.
- `mountEditor` waits until React Flow has measured the notes. Gestures fired
  before that silently do nothing — if a new test is mysteriously inert, check
  that it awaits `mountEditor`.

## The card's gesture contract

Move and type are separate gestures, and the tests are the spec:

- Dragging **anywhere** on the card moves the note. The title and body are
  `pointer-events: none` until the card holds focus, so the press lands on the
  card itself.
- One click selects (canvas shortcuts keep working); a double click opens the
  text the pointer landed on — above the title's bottom edge is the title,
  below it is the body. `Enter` does the same from the keyboard.
- Once a field has focus it behaves like a text field: `nodrag` keeps a
  selection drag from moving the note.
- Linking starts from the 20px `.note-port` band down each side of the card, not
  from the dot. Dropping is card-wide (`.note-drop-zone`) plus
  `connectionRadius`.
- React's `onMouseDown` never fires inside a draggable node: d3-drag calls
  `stopImmediatePropagation` on the press. Use `onClick` (React Flow suppresses
  the click of a press that travelled past `nodeClickDistance`) or a native
  capture listener.
