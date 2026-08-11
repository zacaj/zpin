opus

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**zpin** — TypeScript pinball machine controller running on a Raspberry Pi. Controls solenoids, displays, sound, and game logic via a custom MPU (Main Processing Unit) board.

## Key Architecture

- **`machine.ts`** (~1400 lines) — Central singleton containing all game state, solenoids, outputs, and hardware abstractions
- **`tree.ts`** — Tree data structure with `out?: Outputs` for per-node output control and parent/child relationships
- **`events.ts`** — Pub/sub event system; all cross-module communication flows through this
- **`state.ts`** — Reactive state system with change notifications (`onChange` predicate)
- **`outputs.ts`** — Debounced output management; `MachineOutput` base class with pending/actual/val states
- **`timer.ts`** — Game timer with `wait()`, `schedule()`, `callIn()` abstractions
- **`modes/`** — Game mode hierarchy (attract, game, ball, poker variants, multiball, skillshot, etc.) extending `Mode` from `mode.ts`
- **`gfx/`** — AminoGfx OpenGL animations (game board, poker hands, skillshot, flush, royal flush, straight)
- **`mpu.ts`** — Network socket to the physical MPU board on the machine
- **`cpu.ts`** / **`light.ts`** — Network sockets to auxiliary hardware (CPU display, LED panel)
- **`sound.ts`** — Audio system with `playMusic()`, `playSound()`
- **`switch-matrix.ts`** — Physical switch debouncing; fires `SwitchEvent` on close/open
- **`drop-bank.ts`** — Drop target / standup / lane / bumper logic with state tracking
- **`game.ts`** — `Game` mode singleton; top-level game orchestration
- **`highscore.ts`** — Score persistence and leaderboard management
- **`scores/totals.ts`** — Aggregate statistics across all games

## External Dependencies

- **`aminogfx-gl/`** (in `pi/` subdirectory) — OpenGL animation framework for the machine's display. Native C++ component built via `node-gyp`.
- **`jserver/`** — Java-based game server (not TypeScript).
- The `pi/aminogfx-gl/` directory is a separate Node.js project with its own `package.json`.

## Commands

```bash
npm run build              # TypeScript compilation (output: ./build)
npm run build:watch        # Watch mode
npm run test               # Run tests (single worker, watch mode off)
npm run test:cov           # Tests with coverage
npm run lint               # ESLint across all .ts files
npm run lint:fix           # Auto-fix lint issues
npm run console            # Run console.ts (dev REPL)
npm run sync               # Run syncr.ts
npm run jserver            # Start Java game server
```

## Testing

- Tests use **Jest** (`*.spec.ts` files).
- **Strict thresholds**: branches 90%, functions 95%, lines 95%, statements 95%.
- Run tests in parallel: `npm test -- --watchAll=false`
- Common patterns in `jest.ts` setup:
  - `snapshotOutputs()` — snapshot machine outputs
  - `snapshotState()` — snapshot machine state tree
  - `snapshot()` — both outputs + state
  - `MPU.sendCommandCode` is mocked to return `{code: 200, resp: 'mocked'}`
- `beforeEach` resets all subsystems: `resetSwitchMatrix()`, `resetMachine()`, `Events.resetAll()`, `Timer.reset()`

## Code Style Conventions

- **TypeScript 4.4**, CommonJS modules, ES2018 target, strict mode
- 2-space indentation, semicolons required, comma-dangle always multiline
- Decorators enabled (`experimentalDecorators`, `emitDecoratorMetadata`)
- `no-implicit-returns: false` — functions don't need explicit returns
- `no-floating-promises` on (with ignoreVoid)
- Imports sorted by convention (see `import` ignore pattern in eslint)
- Error handling: use `Log` module with category arrays (`['mpu', 'console']`)

## Hardware Notes

- **MPU**: Main control board, communicates via TCP socket (default port 2908)
- **LPU**: Light Processing Unit — controls LED panels
- **CPU**: Secondary display unit
- **Solenoids**: Controlled via `Solenoid16` boards (16-channel)
- Machine detection via `machine.sDetect3` state

## Debugging Tips

- `debugger;` statements sprinkled in `jest.ts` mocks for breakpoint debugging
- `Log.init(trace)` controls verbosity; categories include: `mpu`, `console`, `game`, `switch`, `gfx`, `sound`, `solenoid`
- `argv` flags from yargs control which subsystems to initialize: `--mpu`, `--gfx`, `--game`, `--trace`, `--cpu`, `--lpu`
- `recordings/` directory contains recorded sessions for replay testing

## Important Files

- `init.ts` — Entry point; bootstraps all subsystems
- `jest.ts` — Test setup/teardown + snapshot utilities
- `util.ts` — Common helpers (`assert`, `arrayify`, `eq`, `objectMap`, etc.)
- `util-modes.ts` — Shared mode utilities (`blink`, `ClearHoles`, `Effect`, `FireCoil`)
- `.vscode/` — Contains launch configs and settings
