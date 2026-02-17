# UI Design Guidelines

Read this file whenever modifying or creating UI components in `apps/web/src/components/`.

These principles are distilled from the Refactoring UI methodology and should be applied consistently across the entire frontend.

## Hierarchy is Everything
- **Not all elements are equal.** Every screen needs a clear visual hierarchy — primary, secondary, and tertiary content must be visually distinct.
- **Size isn't everything.** Use font weight (400/500 normal, 600/700 emphasis) and color (dark for primary, grey for secondary, lighter grey for tertiary) to create hierarchy — not just font size.
- **Emphasize by de-emphasizing.** If an element doesn't stand out enough, try de-emphasizing surrounding elements instead of making the target louder.
- **Labels are a last resort.** Prefer combining label + value into a single phrase (e.g., "3 bedrooms" instead of "Bedrooms: 3"). When labels are needed, de-emphasize them — the data is what matters.
- **Semantics are secondary for buttons.** Primary actions get solid, high-contrast backgrounds. Secondary get outline/lower-contrast. Tertiary are styled like links. Destructive actions are NOT automatically big/red — reserve bold destructive styling for confirmation steps.
- **Don't use grey text on colored backgrounds.** Hand-pick a color with the same hue as the background and adjust saturation/lightness.

## Layout and Spacing
- **Start with too much white space**, then remove until satisfied.
- **Use a spacing/sizing system.** Stick to a constrained scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128). No two adjacent values closer than ~25% apart.
- **Don't fill the whole screen.** If content only needs 600px, use 600px.
- **Avoid ambiguous spacing.** More space *between* groups than *within* groups. Labels closer to their inputs than to the next field.
- **Grids are overrated.** Use fixed widths for sidebars/fixed elements, not percentage-based columns. Use `max-width` for bounded content.
- **Relative sizing doesn't scale.** Large elements shrink faster than small ones on smaller screens. Tune independently per breakpoint.

## Typography
- **Type scale:** Use a hand-crafted set (12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72). No arbitrary pixel values.
- **Use px or rem** — avoid `em` for font sizes (nesting breaks the scale).
- **Line length 45-75 characters** (20-35em) for readable paragraphs.
- **Line-height is proportional.** Small text ~1.5; large headings ~1-1.25. Inversely proportional to font size.
- **Align baselines, not centers** when mixing font sizes on the same line.
- **Left-align text** by default. Center-align only for short, independent blocks (max 2-3 lines). Right-align numbers in tables.
- **Letter-spacing:** Tighten for large headings; increase for ALL-CAPS text.
- **Font weights:** Stick to two — normal (400/500) and bold (600/700). Avoid weights under 400 for UI text.
- **Not every link needs a color.** In link-heavy interfaces, use heavier font weight or darker color instead. Reserve underline/color for hover on ancillary links.

## Color
- **Use HSL over hex** for reasoning about color relationships.
- **You need more colors than you think.** Build a palette with 8-10 grey shades, 5-10 shades of each primary color, 5-10 shades of accent/semantic colors.
- **Define shades up front.** Pick base (500), darkest (900), lightest (100), fill gaps. Use a 9-shade scale (100-900).
- **Increase saturation** as lightness moves away from 50% — otherwise light/dark shades look washed out.
- **Greys don't have to be grey.** Saturate slightly with blue (cool) or yellow/orange (warm) for temperature.
- **Don't rely on color alone.** Always pair with another indicator (icons, text, patterns) for accessibility.
- **Accessible contrast:** 4.5:1 for normal text, 3:1 for large text. Flip contrast (dark text on light bg) when colored backgrounds would be too attention-grabbing.

## Depth and Shadows
- **Light source from above.** Raised: lighter top edge, small dark shadow below. Inset: darker top edge, lighter bottom edge.
- **Shadows convey elevation.** 5 levels: small (buttons), medium (dropdowns), large (modals). Bigger shadow = closer to user = more attention.
- **Two-part shadows:** Larger soft shadow (direct light) + tighter dark shadow (ambient occlusion). Reduce the tight shadow at higher elevations.
- **Flat designs can still have depth** — lighter colors for raised, darker for inset. Solid shadows (no blur) for flat aesthetics.
- **Overlap elements to create layers** — offset cards across background transitions, overlap controls on edges.

## Working with Images
- **Use good photos.** No placeholder images expecting phone photo swaps later.
- **Control shape and size** of user-uploaded images — fixed containers with `object-fit: cover`.
- **Don't scale icons** beyond intended size. Enclose small icons in a shaped background for larger appearance.
- **Prevent background bleed** on user images with subtle inner box-shadow, not a border.

## Finishing Touches
- **Supercharge defaults.** Replace bullets with icons, style checkboxes/radios with brand colors, promote quotes into visual elements.
- **Add color with accent borders** — top of cards, side of alerts, under headlines, active nav items, top of layout.
- **Decorate backgrounds** with subtle color changes, gradients (max 30deg hue difference), or low-contrast repeating patterns.
- **Don't overlook empty states.** First-class experience with illustrations and clear CTAs. Hide filters/tabs when no content.
- **Use fewer borders.** Prefer box shadows, different backgrounds, or extra spacing.
- **Think outside the box.** Dropdowns with columns/icons. Tables with hierarchical cells. Radio buttons as selectable cards.

## Design Personality (This Project)
- **Tone:** Professional but approachable — data/analytics tool, not a social app.
- **Border radius:** Base `0.625rem` (10px). Use `--radius-*` scale (sm through 4xl).
- **Font:** Geist Sans for UI, Geist Mono for code/queries.
- **Primary color:** Teal/Cyan (`--teal-500` base). Fresh, technical, distinctive.
- **Neutrals:** Warm greys with slight blue tint (hue ~250 in OKLCH).
- **Language:** Clear and helpful, not overly casual or stiff.

## Design System Tokens

All tokens defined in `apps/web/src/app/globals.css`.

### Color Palette

**Teal primary (9 shades, `--teal-50` to `--teal-900`):**
| Token | OKLCH | Usage |
|---|---|---|
| `--teal-50` | `oklch(0.97 0.02 180)` | Tinted backgrounds, badges |
| `--teal-100` | `oklch(0.93 0.04 180)` | Light hover backgrounds |
| `--teal-200` | `oklch(0.87 0.08 178)` | Accent text on dark, subtle borders |
| `--teal-300` | `oklch(0.78 0.12 177)` | Hero gradient endpoint (dark mode) |
| `--teal-400` | `oklch(0.68 0.15 176)` | Dark mode primary, links |
| `--teal-500` | `oklch(0.58 0.14 175)` | Light mode base, ring color, hero gradient |
| `--teal-600` | `oklch(0.50 0.13 175)` | Light mode primary (buttons) |
| `--teal-700` | `oklch(0.42 0.11 176)` | Active/pressed states |
| `--teal-800` | `oklch(0.35 0.09 177)` | Text on light tinted backgrounds |
| `--teal-900` | `oklch(0.28 0.07 178)` | Darkest — headings on tinted backgrounds |

**Neutral greys (11 shades, `--neutral-50` to `--neutral-950`):**
Warm greys with slight blue tint (hue 250). `--neutral-950` = darkest (dark mode bg), `--neutral-50` = lightest (light mode bg).

**Semantic status colors (light / dark):**
| Token | Light | Dark | Usage |
|---|---|---|---|
| `--destructive` | Red `oklch(0.577 0.245 27)` | Brighter red `oklch(0.704 0.191 22)` | Errors, delete actions |
| `--success` | Green `oklch(0.55 0.16 145)` | Brighter green `oklch(0.65 0.18 145)` | Success states |
| `--warning` | Amber `oklch(0.75 0.16 75)` | Brighter amber `oklch(0.80 0.15 75)` | Warnings |
| `--info` | Blue `oklch(0.55 0.18 250)` | Brighter blue `oklch(0.65 0.18 250)` | Informational |

### Shadow Elevation System (5 levels)

Each shadow uses two parts (direct light + ambient occlusion):

| Level | CSS Variable | Use Case |
|---|---|---|
| `--shadow-xs` | `0 1px 2px ...` | Subtle lift — buttons, badges |
| `--shadow-sm` | `0 1px 3px ... + 0 1px 2px ...` | Cards, inputs |
| `--shadow-md` | `0 4px 6px ... + 0 2px 4px ...` | Dropdowns, popovers |
| `--shadow-lg` | `0 10px 15px ... + 0 4px 6px ...` | Floating panels, sheets |
| `--shadow-xl` | `0 20px 25px ... + 0 8px 10px ...` | Modals, dialogs |

Dark mode uses higher opacity values (shadows need more contrast on dark backgrounds).

### Typography
- **Font family:** `--font-geist-sans` (UI), `--font-geist-mono` (code)
- **Font sizes:** Tailwind default type scale (`text-xs` through `text-6xl`)
- **Font weights:** 400/500 body, 600/700 emphasis. Never < 400.
- **Line-height:** Tailwind defaults. `leading-relaxed` (1.625) for body, `leading-tight` (1.25) or `leading-none` (1) for headings.

### Spacing
Tailwind v4 default scale (4px base): `1`=4px, `2`=8px, `3`=12px, `4`=16px, `5`=20px, `6`=24px, `8`=32px, `10`=40px, `12`=48px, `16`=64px, `20`=80px, `24`=96px.

### Border Radius
Base `--radius: 0.625rem` (10px). Scale: `sm` (6px), `md` (8px), `lg` (10px), `xl` (14px), `2xl` (18px), `3xl` (22px), `4xl` (26px).

### Dark Mode
- **Provider:** `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
- **Toggle:** `<ThemeToggle />` cycles light -> dark -> system.
- **Component:** `apps/web/src/components/ui/theme-toggle.tsx`
- **Provider:** `apps/web/src/providers/theme-provider.tsx`

## Quick Checklist Before Shipping UI
1. Clear visual hierarchy? (Can you tell what matters most at a glance?)
2. Spacing values from Tailwind scale? (No arbitrary pixel values)
3. Font sizes from Tailwind type scale?
4. Enough contrast for accessibility? (4.5:1 normal, 3:1 large text)
5. Empty state looks good?
6. Borders used sparingly? (Could spacing or background color work instead?)
7. Works at different screen sizes?
8. Semantic colors correct? (`destructive`=errors, `success`=confirmations, `warning`=cautions, `info`=notices)
9. Shadows from 5-level elevation system? (No arbitrary box-shadow values)
10. Looks good in both light and dark mode?
