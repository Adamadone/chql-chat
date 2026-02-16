# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bachelor's thesis project: A web application that converts natural-language inputs into a domain-specific query language (CHQL) using AI models and MCP (Model Context Protocol) architecture. Key focus areas include prompt injection resistance and secure LLM integration.

## Architecture

```
┌─────────────────┐
│   Next.js App   │
│   (Frontend)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│                 Convex Backend                   │
├─────────────────────────────────────────────────┤
│  Queries     │  Mutations   │     Actions       │
│  - chats     │  - chats     │  - ai.process     │
│  - messages  │  - messages  │    Message        │
│  - users     │  - users     │                   │
├─────────────────────────────────────────────────┤
│              Database (Built-in)                 │
│  Tables: users, chats, messages, sessions       │
└────────┬────────────────────────────────────────┘
         │
         ▼ (from Actions — MCP Client)
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│   LLM Provider  │     │  MCP Server          │     │  chy.stat    │
│   (Anthropic    │────▶│  (apps/mcp-server)   │────▶│  API         │
│    Claude)      │     │  Streamable HTTP     │     │  POST /api/  │
└─────────────────┘     └──────────────────────┘     │  v2/search   │
                                                     └──────────────┘
```

### Data Flow
1. User sends natural language message via Next.js frontend
2. Convex action (`ai.processMessage`) receives the message
3. Convex connects to MCP server, fetches available tools
4. Convex calls Anthropic Claude with tool definitions + system prompt
5. Claude generates a CHQL query and requests `search_measurements` tool
6. Convex (MCP client) calls the MCP server's tool via Streamable HTTP
7. MCP server sends CHQL query to chy.stat API, returns results
8. Results sent back to Claude as tool_result
9. Claude generates user-facing response
10. Response stored in Convex DB and displayed to user

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS + ShadCN UI
- **Backend**: Convex (serverless functions + database)
- **Authentication**: Convex Auth (`@convex-dev/auth`) with GitHub OAuth
- **AI Integration**: Anthropic Claude (tool use API) + MCP protocol
- **DSL**: CHQL (chy.stat Query Language) — text-based, defined by ANTLR4 grammar in `docs/antlr4/`
- **MCP Server**: TypeScript + Express + MCP SDK (Streamable HTTP transport)
- **Containerization**: Docker (for production deployment)

## Project Structure

```
chql-chat/
├── apps/
│   ├── web/                       # Next.js 16 application
│   │   ├── src/
│   │   │   ├── app/               # Next.js App Router (pages + layouts)
│   │   │   ├── components/        # React components
│   │   │   │   ├── chat/          #   Chat UI (area, input, messages, sidebar, shell, markdown)
│   │   │   │   ├── auth/          #   Auth UI (sign-in card)
│   │   │   │   └── ui/            #   shadcn/ui primitives (13 components)
│   │   │   ├── hooks/             # Custom React hooks
│   │   │   │   ├── use-auto-scroll.ts       # Latch-to-bottom scroll for ScrollArea
│   │   │   │   ├── use-typewriter.ts        # RAF character-by-character text reveal
│   │   │   │   ├── use-animated-title.ts    # Typewriter animation for chat titles
│   │   │   │   ├── use-message-history.ts   # Arrow-key browsing through past messages
│   │   │   │   └── use-textarea-auto-resize.ts  # Auto-resize textarea to content
│   │   │   ├── utils/             # Utility functions
│   │   │   │   ├── easing.ts      #   Easing functions (easeOutCubic)
│   │   │   │   └── format.ts      #   Formatting helpers (getInitials)
│   │   │   ├── lib/               # shadcn/ui utilities (cn)
│   │   │   └── providers/         # Context providers (Convex, theme)
│   │   └── ...
│   └── mcp-server/                # MCP Server (Streamable HTTP)
│       ├── src/
│       │   └── index.ts           # Server entry point + tool definitions
│       ├── build/                  # Compiled output (gitignored)
│       ├── package.json
│       └── tsconfig.json
├── convex/                        # Convex backend (MCP Client)
│   ├── schema.ts                  # Database schema
│   ├── chats.ts                   # Chat CRUD operations
│   ├── messages.ts                # Message operations
│   ├── users.ts                   # User queries
│   ├── ai.ts                      # LLM + MCP client integration
│   ├── auth.ts                    # Convex Auth config (GitHub OAuth)
│   ├── auth.config.ts             # Auth provider/domain config
│   ├── http.ts                    # HTTP routes (auth callbacks)
│   ├── migrations.ts              # Database migrations
│   └── convex.config.ts           # Convex app definition
├── packages/
│   └── shared/                    # Shared TypeScript interfaces
├── docker/
│   ├── Dockerfile.web             # Next.js production container
│   └── Dockerfile.mcp             # MCP server production container
└── docs/
    ├── antlr4/                    # CHQL grammar (lexer + parser)
    ├── CLAUDE.md                  # This file
    ├── SETUP.md                   # Env vars, auth, secrets, Convex config
    ├── DEPLOYMENT.md              # Production deployment guide
    ├── bachelors-specs.md         # Thesis implementation plan
    ├── bachelors-thesis-zadani.md # Thesis assignment (Czech/English)
    ├── Scenarios-prompt-examples.md # NL-to-CHQL test scenarios
    └── initial-plan.md            # Original planning document
```

## Development Commands

```bash
# Install dependencies
npm install

# Start development (Next.js + Convex)
npm run dev

# Start only Next.js
npm run dev:web

# Start only Convex
npm run convex:dev

# MCP Server commands
npm run mcp:build              # Compile TypeScript
npm run mcp:dev                # Watch mode
npm run mcp:start              # Run server (with dotenvx for env vars)

# Build for production
npm run build

# Docker commands
npm run docker:build
npm run docker:up
npm run docker:down
npm run docker:logs
```

### Running the full stack locally
1. Start the MCP server: `npm run mcp:start` (listens on port 3001)
2. Start Convex + Next.js: `npm run dev`
3. Open http://localhost:3000

## Environment Variables

See [SETUP.md](./SETUP.md#environment-variables) for the full environment variables table, secrets inventory, dotenvx encryption guide, and Convex env var configuration.

## Convex Backend Structure

### Schema (convex/schema.ts)
- `users` - User accounts synced from Convex Auth
- `chats` - Chat conversations per user (with `activeToolCall` for real-time tool-use UI feedback)
- `messages` - Messages within chats (user/assistant roles, optional metadata with dslQuery/apiResponse/error/toolCalls, `interrupted` flag)
- Auth tables (`authAccounts`, `authSessions`, `authRefreshTokens`) - managed by Convex Auth

### Key File: convex/ai.ts (MCP Client)
- `processMessage` action — main entry point for the LLM + tool use flow
- `createMCPClient()` — connects to the MCP server via Streamable HTTP transport
- `getMCPToolsAsAnthropicTools()` — fetches tools from MCP server, converts to Anthropic format
- `callMCPTool()` — executes a tool call via MCP protocol
- `runLLMWithTools()` — multi-turn loop handling Claude's tool_use requests (max 5 rounds)
- `generateTitle` action — auto-generates chat titles
- Graceful degradation: if MCP server is unavailable, LLM responds without tools

## MCP Server (apps/mcp-server/)

### Transport
- **Default**: Streamable HTTP on port 3001 (`/mcp` endpoint)
- **Alternative**: stdio transport (`--stdio` flag, for Claude Desktop or direct testing)
- Health check: `GET /health` (unauthenticated)

### Security
- Bearer token auth on `/mcp` routes (`MCP_AUTH_TOKEN`, required in production)
- Timing-safe token comparison to prevent timing attacks
- Per-IP sliding-window rate limiting (60 req/min)
- Concurrent session cap (100)
- Request body size limit (1 MB)
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`)
- Non-root Docker user in production container

### Tool: search_measurements
- **Input**: `query` (CHQL string), `pageSize` (optional, 1-1000), `pageNumber` (optional, 1-based)
- **Calls**: `POST https://demo.chystat.com/api/v2/measurements/search`
- **Auth**: Bearer token from `CHYSTAT_API_TOKEN` env var
- **Response format**: `aqdef-json` (static)

## CHQL (chy.stat Query Language)

Text-based DSL defined by ANTLR4 grammar in `docs/antlr4/`. Grammar overview:
- K-key identifiers: `K` followed by digits (e.g. `K1001`, `K2001`, `K0001`)
- Comparison: `=`, `<`, `<=`, `>`, `>=`, `LIKE`, `=~`
- Logical: `AND`, `OR`, `NOT`, parentheses
- Special: `ALL`, `IS NULL`, `IN (...)`, `HAS ALARM`, `HAS NO ALARM`, `HAS MARK`, `ANY VALUE MATCHES`, `ALL VALUES MATCHES`

## Security Requirements

This project emphasizes prompt injection resistance with three defense layers:

**Hard Constraints:**
- CHQL query validation (MCP server validates before API call)
- Allowlisted API endpoint (only measurements/search)
- Output shaping (tool returns only measurement data)

**Context Hygiene:**
- System prompt explicitly marks API responses as data
- Clear delimiter boundaries between instructions and untrusted content

**Operational Controls:**
- Max 5 tool call rounds per message (prevents infinite loops)
- Per-IP rate limiting on MCP server (60 req/min sliding window)
- Concurrent session cap on MCP server (100 sessions)
- Request body size limit (1 MB)
- Timing-safe token comparison (prevents timing attacks)
- Security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`)

## UI Design Guidelines (Based on Refactoring UI)

When building or modifying UI components, follow these principles. They are distilled from the Refactoring UI methodology and should be applied consistently across the entire frontend.

### Hierarchy is Everything
- **Not all elements are equal.** Every screen should have a clear visual hierarchy — primary, secondary, and tertiary content must be visually distinct.
- **Size isn't everything.** Use font weight (400/500 for normal, 600/700 for emphasis) and color (dark for primary, grey for secondary, lighter grey for tertiary) to create hierarchy — not just font size.
- **Emphasize by de-emphasizing.** If an element doesn't stand out enough, try de-emphasizing the elements around it instead of making the target louder.
- **Labels are a last resort.** Prefer combining label + value into a single readable phrase (e.g., "3 bedrooms" instead of "Bedrooms: 3"). When labels are needed, de-emphasize them — the data is what matters.
- **Semantics are secondary for buttons.** Primary actions get solid, high-contrast backgrounds. Secondary actions get outline/lower-contrast styles. Tertiary actions are styled like links. Destructive actions are NOT automatically big/red — reserve bold destructive styling for confirmation steps.
- **Don't use grey text on colored backgrounds.** Instead, hand-pick a color with the same hue as the background and adjust saturation/lightness.

### Layout and Spacing
- **Start with too much white space**, then remove until satisfied. White space should be *removed*, not *added*.
- **Use a spacing/sizing system.** Stick to a constrained scale (e.g., 4, 8, 12, 16, 24, 32, 48, 64, 96, 128). No two adjacent values should be closer than ~25% apart.
- **Don't fill the whole screen.** If content only needs 600px, use 600px. Don't stretch things just because space is available.
- **Avoid ambiguous spacing.** When using spacing to group elements, ensure there is more space *between* groups than *within* groups. Labels should be closer to their associated inputs than to the next field.
- **Grids are overrated.** Sidebars and fixed-width elements should use fixed widths, not percentage-based grid columns. Use `max-width` for content that shouldn't grow beyond a certain size.
- **Relative sizing doesn't scale.** Large elements should shrink faster than small elements on smaller screens. Don't use a single ratio (like `2.5em`) across breakpoints — tune independently.

### Typography
- **Establish a type scale.** Use a hand-crafted set of font sizes (e.g., 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72). Don't pick arbitrary pixel values.
- **Use px or rem units** — avoid `em` for font sizes (nesting breaks the scale).
- **Keep line length 45-75 characters** (20-35em) for readable paragraphs.
- **Line-height is proportional.** Small text needs more line-height (~1.5); large headings need less (~1-1.25). Line-height and font size are inversely proportional.
- **Align baselines, not centers** when mixing font sizes on the same line.
- **Left-align text** by default. Center-align only for short, independent blocks (max 2-3 lines). Right-align numbers in tables.
- **Letter-spacing:** Tighten for large headings; increase for ALL-CAPS text.
- **Font weights:** Stick to two weights for UI — normal (400/500) and bold (600/700). Avoid weights under 400 for UI text.
- **Not every link needs a color.** In link-heavy interfaces, use heavier font weight or darker color instead. Reserve underline/color change for hover on ancillary links.

### Color
- **Use HSL over hex** for reasoning about color relationships (hue, saturation, lightness).
- **You need more colors than you think.** Build a palette with:
  - 8-10 shades of grey (starting from near-black, not true black, up to white)
  - 5-10 shades of each primary color
  - 5-10 shades of accent/semantic colors (red, yellow, green, blue, etc.)
- **Define shades up front.** Pick base (500), darkest (900), and lightest (100), then fill in gaps. Use a 9-shade scale (100-900).
- **Increase saturation** as lightness moves away from 50% — otherwise light/dark shades look washed out.
- **Greys don't have to be grey.** Saturate them slightly with blue (cool) or yellow/orange (warm) for temperature.
- **Don't rely on color alone.** Always pair color with another indicator (icons, text, patterns) for accessibility.
- **Accessible contrast:** 4.5:1 minimum for normal text, 3:1 for large text. Flip contrast (dark text on light colored background) when colored backgrounds would be too attention-grabbing.

### Depth and Shadows
- **Emulate a light source from above.** Raised elements: lighter top edge, small dark shadow below. Inset elements: darker top edge (shadow), lighter bottom edge.
- **Use shadows to convey elevation.** Define 5 shadow levels: small (buttons), medium (dropdowns), large (modals). Bigger shadow = closer to user = more attention.
- **Two-part shadows:** A larger soft shadow (direct light) + a tighter dark shadow (ambient occlusion). Reduce the tight shadow at higher elevations.
- **Flat designs can still have depth** — use lighter colors for raised elements, darker for inset. Solid shadows (no blur) work for flat aesthetics.
- **Overlap elements to create layers** — offset cards across background transitions, overlap controls on edges.

### Working with Images
- **Use good photos.** Never use placeholder images expecting to swap in phone photos later.
- **Control shape and size** of user-uploaded images — use fixed containers with `object-fit: cover`.
- **Don't scale icons** beyond their intended size. If you need large icons, enclose small ones in a shaped background.
- **Prevent background bleed** on user images with a subtle inner box-shadow, not a border.

### Finishing Touches
- **Supercharge the defaults.** Replace bullets with icons, style checkboxes/radios with brand colors, promote quotes into visual elements.
- **Add color with accent borders** — top of cards, side of alerts, under headlines, active nav items, top of the layout.
- **Decorate backgrounds** with subtle color changes, gradients (max 30deg hue difference), or low-contrast repeating patterns.
- **Don't overlook empty states.** Design them as a first-class experience with illustrations and clear calls-to-action. Hide filters/tabs when there's no content.
- **Use fewer borders.** Prefer box shadows, different background colors, or extra spacing to create separation.
- **Think outside the box.** Dropdowns can have columns and icons. Tables can combine related data into hierarchical cells. Radio buttons can be selectable cards.

### Design Personality (for this project)
- **Tone:** Professional but approachable — this is a data/analytics tool, not a social app.
- **Border radius:** Base `0.625rem` (10px). Use the `--radius-*` scale (sm through 4xl).
- **Font:** Geist Sans (sans-serif) for UI, Geist Mono for code/queries.
- **Primary color:** Teal/Cyan (`--teal-500` base). Fresh, technical, distinctive.
- **Neutrals:** Warm greys with a slight blue tint (hue ~250 in OKLCH) — not pure grey.
- **Language:** Clear and helpful, not overly casual or stiff.

### Concrete Design System Tokens

All tokens are defined in `apps/web/src/app/globals.css`.

#### Color Palette

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
Warm greys with slight blue tint (hue 250). `--neutral-950` is the darkest (dark mode background), `--neutral-50` is lightest (light mode background).

**Semantic status colors (light / dark):**
| Token | Light | Dark | Usage |
|---|---|---|---|
| `--destructive` | Red `oklch(0.577 0.245 27)` | Brighter red `oklch(0.704 0.191 22)` | Errors, delete actions |
| `--success` | Green `oklch(0.55 0.16 145)` | Brighter green `oklch(0.65 0.18 145)` | Success states |
| `--warning` | Amber `oklch(0.75 0.16 75)` | Brighter amber `oklch(0.80 0.15 75)` | Warnings |
| `--info` | Blue `oklch(0.55 0.18 250)` | Brighter blue `oklch(0.65 0.18 250)` | Informational |

#### Shadow Elevation System (5 levels)

Each shadow uses two parts (direct light + ambient occlusion per Refactoring UI):

| Level | CSS Variable | Use Case |
|---|---|---|
| `--shadow-xs` | `0 1px 2px ...` | Subtle lift — buttons, badges |
| `--shadow-sm` | `0 1px 3px ... + 0 1px 2px ...` | Cards, inputs |
| `--shadow-md` | `0 4px 6px ... + 0 2px 4px ...` | Dropdowns, popovers |
| `--shadow-lg` | `0 10px 15px ... + 0 4px 6px ...` | Floating panels, sheets |
| `--shadow-xl` | `0 20px 25px ... + 0 8px 10px ...` | Modals, dialogs |

Dark mode uses higher opacity values since shadows need more contrast on dark backgrounds.

#### Typography

- **Font family:** `--font-geist-sans` (UI), `--font-geist-mono` (code)
- **Font sizes:** Use Tailwind's default type scale (`text-xs` through `text-6xl`)
- **Font weights:** 400/500 for body, 600/700 for emphasis. Never use weights < 400.
- **Line-height:** Tailwind defaults. Use `leading-relaxed` (1.625) for body text, `leading-tight` (1.25) or `leading-none` (1) for headings.

#### Spacing

Use Tailwind v4 default scale (4px base): `1`=4px, `2`=8px, `3`=12px, `4`=16px, `5`=20px, `6`=24px, `8`=32px, `10`=40px, `12`=48px, `16`=64px, `20`=80px, `24`=96px.

#### Border Radius

Base `--radius: 0.625rem` (10px). Scale: `sm` (6px), `md` (8px), `lg` (10px), `xl` (14px), `2xl` (18px), `3xl` (22px), `4xl` (26px).

#### Dark Mode

- **Provider:** `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
- **Toggle:** `<ThemeToggle />` component cycles light -> dark -> system.
- **Component:** `apps/web/src/components/ui/theme-toggle.tsx`
- **Provider:** `apps/web/src/providers/theme-provider.tsx`

### Quick Checklist Before Shipping UI
1. Is there a clear visual hierarchy? (Can you tell what matters most at a glance?)
2. Are spacing values from the Tailwind scale? (No arbitrary pixel values)
3. Are font sizes from the Tailwind type scale?
4. Is there enough contrast for accessibility? (4.5:1 normal text, 3:1 large text)
5. Does the empty state look good?
6. Are borders used sparingly? (Could spacing or background color work instead?)
7. Does it work at different screen sizes?
8. Are semantic colors used correctly? (`destructive` for errors, `success` for confirmations, `warning` for cautions, `info` for notices)
9. Are shadows from the 5-level elevation system? (Not arbitrary box-shadow values)
10. Does the component look good in both light and dark mode?

## Key References

- MCP Documentation: https://modelcontextprotocol.io/docs/getting-started/intro
- chy.stat API Docs: https://apidocs.chystat.com/v2/current
- Convex Documentation: https://docs.convex.dev
- Convex Auth Documentation: https://labs.convex.dev/auth
- OWASP agent security guidance for threat modeling
- Refactoring UI (design principles): `docs/RefactoringUI.md`
