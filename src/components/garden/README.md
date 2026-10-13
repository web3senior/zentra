# Agent Colony (home page, `/`)

A Mars colony of hexagonal plots, in real Three.js geometry. Plot 0 is the hub; agent i stands
on plot i + 1. Plots fill ring by ring, so a plot's index never changes, and complete rings
always leave at least three vacant plots: the future rented land. Owned plots get a tone, a
glowing border and seeded habitat modules. Each robot's pose follows its status, and a bubble
shows it: hammer working, ? waiting for the owner's approval, check ready, Z paused, ! error.
Rocks, craters, plots and modules are instanced.

Chain districts sit beside the colony, one per ERC-8004 registry in `config/chains.js` (LUKSO
first), each a cluster of plots round its monument: the chain's logo (`logo` in the config) as a
floating 3D emblem with orbiting rings, shards and a hologram beam (`Monument.jsx`). Districts use
the chain's brand colour, tokens `--color-garden-edge-<chain>` and `plot-<chain>` (LUKSO #FE005B;
Monad #836EF9 and Base #0052FF ready for when they are indexed). `GardenHome` reads them from the public
`/api/zentra/chains`; their agents are read-only residents (`ChainPanel` shows registry facts).
Plot name tags hide when the camera is far away; bubbles and district labels stay.

`GardenHome` shows the signed-in owner's real agents (read-only, status polled from
`/api/zentra/world`) and the samples when signed out. Selecting a real agent opens its chat
in the colony (`GardenChat`: same endpoints and approval cards as `/agents`).
`Garden` accepts an optional controlled `agents` array, `onAgentsChange` and `onSelectAgent`.
Agent creation, status changes and removal are local samples by default. There is no wallet,
registration, plot rental or live task execution in this scene.

- `layout.js`: hex spiral, plot and ring counts, regions (colony and districts) and walking heights.
- `Objects.jsx`: Mars surface, plots, habitat modules, the hub and district beacons.
- `Resident.jsx`: robots, status bubbles and plot name tags.
- `JobBoard.jsx`, `JobBoardPanel.jsx`: the read-only Hup Tasks job board on the home colony's last plot and its list (data from `GET /api/zentra/jobs`, `lib/zentra/jobs.js`).
- `Atmosphere.jsx`: Mars dusk sky dome (shares the fog haze), faint stars, Phobos, Deimos and
  the Earth as a blue star.
- `Human.jsx`: an astronaut with a name tag. The visitor walks as one (username from
  `/api/zentra/world`, or "You" signed out); other people can be drawn the same way later.
- `Navigation.jsx`: overview orbit/pan/zoom and third-person walking with a follow camera.
- `Scene.jsx`: lazy-loaded renderer, lighting, render lifecycle and development diagnostics.
- `Garden.jsx`: accessible controls, resident details, sample editing and visibility handling.
- `palette.js`: colors read from the shared CSS tokens.

Walk with WASD/arrows or the touch direction pad as your astronaut; the camera follows from
behind and dragging orbits it round you. Walking starts at
the colony edge facing the hub; plots are low platforms you step onto and the colony edge
stops movement. Overview supports drag rotation, right-drag pan and wheel/touch zoom, and its
distance grows with the number of rings. Recenter resets either mode. Pausing or reduced
motion uses demand rendering; hidden/offscreen scenes stop rendering.

Run `scripts/test-garden.cjs` with `GARDEN_URL`, `PLAYWRIGHT_MODULE` and `BROWSER_PATH` for
browser verification, including real mesh picking, agent changes, the colony edge, plot
heights, mobile controls and paused/offscreen rendering.
