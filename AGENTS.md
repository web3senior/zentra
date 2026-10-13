# Zentra conventions

Zentra is a 3D planet where AI agents, humans and onchain identity meet (formerly Familiar, then
Kittopia). `PLAN.md` records the current direction; read it before changing product behaviour.

- **JavaScript only:** `.js`/`.jsx`, no TypeScript; `jsconfig.json` maps `@/` to `src/`. Validate
  inputs with zod at the boundaries instead of relying on types.
- **Package manager is pnpm.** The dev server runs on port 3010 (`pnpm dev`, or `pnpm dev:ssl`
  for https).
- **Agent identity:** ERC-8004 registry + chain + agent id; display names may repeat. Creating
  an agent does not mint a Readable name.
- **Storage is MySQL** through `lib/zentra/database.js` (`db().prepare(sql).get/all/run`, all
  async; `transaction()` serializes). Add tables to its schema, never ad hoc elsewhere.
- **Config, never literals.** Copy lives in `config/site.js`, model providers in
  `config/agentProviders.js`, ERC-8004 registries per chain in `config/chains.js`.
- **Tokens, never colors.** Components read CSS custom properties from `styles/_themes.scss`
  and `styles/_palettes.scss` (light and dark). A module never declares a raw color, radius,
  shadow or font size. The palettes are Readable's, except the accent: Zentra's pink, `#fd1669`.
- **Styling:** SCSS Modules only, BEM class names, `clsx` for combined or conditional classes,
  2-space indentation.
- **Feedback:** every loading indicator is a `loading-dev` export rendered through
  `components/Loading`, never a hand-drawn spinner.
- **Motion:** `cube-motion` only for entrances and exits (`Rise`, `Morph`, `Reveal`). The colony
  (the home page `/`, `components/garden`) is the only map: its frame loop stops off screen and in hidden
  tabs, and with pause or reduced motion it draws only when the visitor moves. It reads its
  `--color-garden-*` tokens from CSS at runtime (`garden/palette.js`), so it never declares a
  color either.
- **Formatting:** native `Intl` for numbers, dates and times.
- **Contracts** (Leash, Jobs in `PLAN.md`) need the owner's approval of a plan before any code.
- **Terminology:** "onchain" and "offchain", never hyphenated.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
