shadcn/ui parts (`npx shadcn@latest add <item>`) land in `ui/`; the board's own parts built from them, such as `shell.tsx`, sit beside it. Tailwind scans this folder only; see ADR 0004.
