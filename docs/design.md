# Design direction

Fixed by the prototype. Later tickets implement against it and do not redesign.

## Tokens

- Two themes as CSS variables in oklch, selected by `class` on `html` through next-themes, following the system preference with a manual toggle in the header.
- Light is warm paper: background `oklch(0.975 0.008 85)`, card `oklch(0.99 0.005 85)`, foreground `oklch(0.2 0.01 260)`.
- Dark is graphite: background `oklch(0.17 0.012 260)`, card `oklch(0.21 0.012 260)`, foreground `oklch(0.93 0.008 85)`.
- Semantic tokens beyond the shadcn set: `status-active`, `status-failed`, `status-stopped` for Status dots, `live` for the sync indicator, `chip-1` to `chip-8` for hashed chip hues.
- Every text and chip pairing meets WCAG AA at 4.5:1 in both themes, with tints composited in gamma-encoded sRGB. Chip text sits on a 10% tint of its own hue over the card; light chips are `L 0.5`, dark chips `L 0.78` to `0.8`. Destructive is `L 0.52` in light and `L 0.78` in dark so invalid-token chips clear the same bar on the registry tint. Status and sync dots are non-text and clear 3:1.

## Fonts

- Atkinson Hyperlegible Next for text and Atkinson Hyperlegible Mono for identifiers, counts, and chips, as `--font-sans` and `--font-mono`.
- Both are self-hosted latin subsets under `web/src/fonts` with the OFL licence, loaded through `next/font/local` with `display: swap` and a size-adjusted Arial fallback computed from the font file. The swap is metric-compatible, so first paint does not shift. The Google loader has no fallback metrics for either family, which is why they are local.

## Chip colour hashing

- A chip's hue is a djb2 hash of its value modulo eight, mapped to `chip-1` to `chip-8`. The same value always gets the same hue in every column, tab, and session.
- A chip renders as `bg-chip-N/10 text-chip-N border-chip-N/30` on the outline Badge in mono at 11px.

## Table

- Rows are 40px, fixed, with a sticky 36px header. Virtualised rows keep the same height so the skeleton, the table, and the scrollbar agree.
- Facets render as outline Badges: Status with a coloured dot, Type with an icon, Environment filled for production and ghost otherwise.

## Footer status

- One 32px `footer` landmark owned by the shell: row window and matched count on the left, matched count in an `aria-live` region, total shown only when a query narrows the set, sync indicator on the right.
- The feature publishes `counts` and `sync` through the shell's footer-status context. Until something publishes, the bar shows `—` placeholders and `connecting` with a grey dot. Live shows `live` with a pinging teal dot; the ping is hidden under reduced motion.

## Motion

- `prefers-reduced-motion: reduce` collapses every animation and transition to near zero globally and hides the sync ping. Theme changes never transition.

## Shell

- Header: brand link, theme toggle. Skip link is the first tab stop and targets `#main`. Main is a flex column that the feature fills. Footer follows main. Every focusable shell control shows the 3px ring.
