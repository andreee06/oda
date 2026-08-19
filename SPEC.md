# Oda — scope & design notes

> Where I write down what v1 is (and isn't) so I don't keep redrawing the
> finish line. If a decision changes, it changes here first.

## Objective

A self-hosted, Discord-inspired group chat for ~5–10 friends, accessible over the
internet (later) without VPNs. **Name: Oda** (final — dir, packages, branding). Success = friends actually hang out in it: text
channels, GIF avatars, GIF picker, uploads, presence, and voice channels.

**v1 scope (frozen):**
- Invite-only accounts (register via invite code, login/logout)
- Servers with text channels, create/rename/delete
- Realtime messaging over WebSocket, persisted history with pagination
- Rich content: image/file uploads, animated GIF avatars, custom emoji,
  GIPHY GIF picker (Tenor was the original choice, but Google shut the Tenor
  API down on 2026-06-30), link-embed previews
- Presence (online/idle/offline) + typing indicators
- Roles: owner / member (minimal permission model)
- Voice channels via self-hosted LiveKit (mute/deafen, speaking indicator)

**Explicitly NOT in v1:** DMs, threads, forum channels, message reactions,
screen share, mobile/native apps, federation, bots/webhooks, E2E encryption.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere | One language, shared types between client/server |
| Backend | Node.js 26 + Fastify 5 | Fast, typed, smaller surface than Express |
| Realtime | `ws` (WebSocket) in same process as API for v1 | 10 users don't need a split gateway; design keeps split possible |
| DB | PostgreSQL 17 + Prisma | Relational model fits; migrations out of the box |
| Media | MinIO (S3 API) via `@aws-sdk/client-s3` | Avatars/uploads/emoji; swap to real S3 later |
| Voice | LiveKit server (self-hosted, Docker) + `livekit-client` | Built-in TURN = no VPN/NAT pain; don't hand-roll an SFU |
| Frontend | React 19 + Vite 7 + Tailwind CSS 4 | Biggest ecosystem, Discord-like reference code exists |
| GIFs | GIPHY API (free key) | GIF picker + embed rendering. Tenor was planned but Google killed the API on 2026-06-30. |
| Auth | Opaque session token, httpOnly Secure cookie | Simpler & safer than JWT-in-localStorage; CSRF token for mutations |
| Monorepo | npm workspaces | pnpm not installed; npm 12 workspaces suffice |

**v1 simplification (conscious):** no Redis. Presence/typing live in-process.
Redis gets added only if we split the gateway or scale past one instance.

## Commands

```bash
# Setup
npm install                        # install all workspaces
docker compose up -d               # postgres, minio, livekit (dev infra)
npm run db:generate -w server       # prisma generate (needed after fresh clone)
npm run db:migrate -w server       # prisma migrate dev
npm run db:seed -w server          # creates owner account + default server

# Dev (two terminals, or `npm run dev` runs both via concurrently)
npm run dev                        # server :3001 + client :5173 (vite proxy)

# Quality gates (must pass before commit)
npm run typecheck                  # tsc --noEmit across workspaces
npm run lint                       # eslint
npm test                           # vitest (server: unit+integration; client: component)
```

## Project Structure

```
oda/
├── SPEC.md                  → this file (source of truth)
├── docker-compose.yml       → dev infra: postgres, minio, livekit
├── package.json             → npm workspaces root
├── server/                  → Fastify API + WS gateway (one process, v1)
│   ├── src/
│   │   ├── index.ts         → bootstrap, route registration
│   │   ├── routes/          → REST endpoints (auth, servers, channels, messages, uploads)
│   │   ├── gateway/         → WebSocket hub, event dispatch, presence
│   │   ├── services/        → business logic (invite codes, embeds, s3)
│   │   └── lib/             → prisma client, config, errors
│   ├── prisma/schema.prisma
│   └── tests/               → vitest, unit + integration (testcontainers optional)
├── client/                  → React + Vite SPA
│   ├── src/
│   │   ├── components/      → ServerRail, ChannelList, ChatView, MemberList, ...
│   │   ├── routes/          → react-router pages
│   │   ├── stores/          → zustand stores (session, servers, gateway)
│   │   └── gateway/         → WS client, event handlers, optimistic send
│   └── tests/
├── packages/shared/         → @oda/shared: event types, DTOs, zod schemas
└── docs/                    → ADRs for big decisions (voice, auth, deploy)
```

## Code Style

- TypeScript `strict: true`; no `any` without a `// justified:` comment.
- ESM everywhere. Absolute imports via path aliases (`@/…`, `@oda/shared`).
- Naming: `camelCase` vars/fns, `PascalCase` components/types, `SCREAMING_SNAKE` env vars,
  DB tables `snake_case` plural (`messages`, `channel_members`).
- zod schemas in `packages/shared` are the single contract — server validates
  requests AND emits events typed from the same schemas.
- One representative snippet:

```ts
// server/src/routes/messages.ts
export const createMessage: RouteHandler = async (req, reply) => {
  const body = CreateMessageBody.parse(req.body);      // zod, shared schema
  const msg = await messageService.create(req.userId, req.channelId, body);
  gateway.dispatchToChannel(req.channelId, {           // typed event, shared schema
    type: "MESSAGE_CREATE",
    data: toMessageDTO(msg),
  });
  return reply.code(201).send(toMessageDTO(msg));
};
```

## Testing Strategy

- **Vitest** everywhere. Tests live next to workspaces: `server/tests/`, `client/tests/`.
- Server: unit tests for services (prisma mocked or test-DB), integration tests for
  routes (fastify `inject`), WS gateway tests with real `ws` client against ephemeral port.
- Client: component tests (testing-library) for ChatView/send flow; gateway client tests
  with a mock WS server.
- Coverage expectation: services/gateway logic ~80% lines; UI pragmatic, not dogmatic.
- TDD for business logic: failing test first, then implementation.

## rules I'm holding myself to

- **always:** typecheck + lint + tests green before committing; validate all
  outside input with zod at the edge; paginate every list endpoint; update
  this file when a decision changes.
- **think twice first:** new dependencies, prisma schema changes, touching the
  frozen v1 scope, exposing anything to the public internet, compose port changes.
- **just don't:** commit secrets (`.env.example` only), store passwords without
  argon2id, put tokens in localStorage, hand-roll WebRTC instead of using
  LiveKit, or delete a failing test to make CI happy.

## definition of done (v1)

1. Two browsers on different machines (LAN for now) can register via invite code,
   join the default server, and exchange messages in real time (<150 ms LAN latency,
   no refresh).
2. Reloading the client restores full message history (paginated, 50/page).
3. A user can set an animated GIF avatar and it animates in chat + member list. ✅ slice 2
4. `/giphy`-style picker inserts a GIF that renders inline for everyone. ✅ slice 2 (needs GIPHY_API_KEY)
5. An image upload appears inline for all members within 2s. ✅ slice 2
6. Presence list updates within 5s of connect/disconnect; typing indicator shows
   and expires after 3s of silence. ✅ slice 3 (idle transitions lag one 30s heartbeat tick)
7. Two users in a voice channel hear each other through LiveKit (dev: same LAN).
8. `npm run typecheck && npm run lint && npm test` pass from a clean clone.
9. Invite-only: no route permits account creation without a valid invite code.

## open questions

1. ~~Project name~~ → **Oda**.
2. GIPHY API key — register a free one (developers.giphy.com, instant beta key). Tenor is no longer an option: Google shut it down 2026-06-30.
3. Emoji: Unicode-only at launch, or custom server emoji in v1? (currently: custom in v1)
4. Message edit/delete — assume YES (soft-edit, hard-delete) for v1? Not listed above; confirm.
