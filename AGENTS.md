<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design rules
- Read DESIGN.md at the project root before creating or changing any UI.
- Use only CSS variables/tokens from src/app/globals.css (primary, muted, border, radius, etc.). Never hardcode hex colors and never use Tailwind literal color classes (bg-blue-600, text-gray-500 and similar).
- Follow DESIGN.md component rules: radius, spacing, type scale, button/input/card states.
- Light mode is the default theme. Dark tokens exist in globals.css (.dark block) but there is no theme toggle — do not add one.
