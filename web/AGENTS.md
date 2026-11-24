<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI components

Add new shared controls from the official Radix-based shadcn/ui registry. From the repository root, run `npx shadcn@latest add <component> --cwd web --dry-run` to review changes, then repeat without `--dry-run` to install. Import the resulting components from `@/components/ui`. Keep the project theme, use the existing `cn` helper from `@/lib/utils`, and adapt the generated styles to match Figma. Review diffs before overwriting customized controls.
