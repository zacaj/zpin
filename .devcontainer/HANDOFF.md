# zpin devcontainer — handoff

## What's set up
- Node 24 (typescript-node base image) — `npm install` runs automatically on create.
- Java 8 + Maven (for `jserver/`, currently untouched by this setup).
- apt packages for native addon builds: build-essential, python3, pkg-config,
  libglfw3-dev, libgl1-mesa-dev, libfreetype6-dev, libjpeg-dev, libpng-dev,
  zlib1g-dev, libavcodec/format/util/swscale-dev.
- Host `/tmp/.X11-unix` is bind-mounted in and `DISPLAY` is forwarded from the
  host, so GUI windows opened in the container should appear on the host's X
  display (host is X11, confirmed working with `DISPLAY=:0`).

## What's NOT set up yet
`pi/aminogfx-gl` (the native OpenGL module the gfx simulator depends on) has
**no Linux x86_64 build target** in `binding.gyp` — only `OS == "mac"`
(GLFW via Homebrew/MacPorts) and `OS == "linux" && target_arch == "arm"`
(Raspberry Pi VideoCore/EGL/DRM, real hardware only). `npm install` in that
directory will not produce a working `.node` binary in this container as-is.

There's also an **archived pre-fork copy** at
`/var/home/zacaj/src/source/aminogfx-gl/` with a `OS == "win"` branch
(`src/win.cpp` + `src/glad.c`, linked against prebuilt GLFW/libpng/zlib/
freetype at `c:/root/...`) — this is how the simulator ran on Windows
originally. It's a useful reference for the porting work but isn't a
drop-in Linux solution either (prebuilt Windows libs, no pkg-config).

### Porting work needed (not done in this pass)
1. Add a `linux` (non-arm) branch to `pi/aminogfx-gl/binding.gyp` that links
   against the apt-installed dev libs above via `pkg-config` (glfw3,
   freetype2, libpng, zlib), similar in shape to the existing mac branch.
2. Adapt `src/win.cpp` (GL context/window creation, input handling) into a
   new `src/linux.cpp` (or generalize into a shared GLFW backend) — `glad.c`
   from the Windows branch may be reusable as the GL loader.
3. `npm install --build-from-source` inside `pi/aminogfx-gl/` to compile,
   then confirm `npm start`/`--gfx` opens a window that appears on the host
   via the forwarded X11 display.

## Quick verification once inside the container
```bash
npm run build      # tsc compiles
npm test -- --watchAll=false --passWithNoTests   # jest runs
glxinfo | head      # (may need `apt-get install mesa-utils` ad hoc) confirms GL/X11 reachable
```
