# Oda — Implementation Plan

Source of truth: `SPEC.md`. This plan covers the dependency order, risks, and
checkpoints. Task-level detail lives in `tasks/todo.md`.

## Components & dependencies

```
packages/shared (zod contracts)  ←── everything depends on this
        │
        ▼
docker infra (postgres, minio, livekit)   ←── no code deps, runs in parallel
        │
        ▼
prisma schema + seed ──→ auth (invite-only register/login/logout/me)
        │                      │
        ▼                      ▼
servers/channels REST ──→ WS gateway (session auth on upgrade, heartbeat)
        │                      │
        └──────┬───────────────┘
               ▼
messages REST + MESSAGE_CREATE dispatch ──→ client app shell + gateway client
               │
               ▼
   Slice-1 checkpoint: two browsers exchange realtime messages (SPEC criterion #1)
```

Later slices (2: rich content → 3: presence/typing → 4: voice) all attach to the
same gateway + shared contracts; no re-architecture needed.

## Implementation order (slices, each independently usable)

1. **Slice 1 — Text MVP** (tasks 1–8): scaffold → infra → schema → auth →
   channels → gateway → messages → client shell.
2. **Slice 2 — Rich content**: MinIO uploads, GIF avatars, GIF picker (GIPHY; Tenor was the original plan but Google killed the API mid-build), embeds.
3. **Slice 3 — Social layer**: presence, typing, roles, invite-link UI.
4. **Slice 4 — Voice**: LiveKit token endpoint, voice-channel UI, mute/deafen.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Scope creep kills momentum | v1 scope frozen in SPEC.md; changes edit SPEC first |
| WS gateway auth bugs (sessions on upgrade) | Integration test with real ws client per gateway change |
| "Works on my machine" | Slice-1 checkpoint uses two browsers on LAN, not localhost only |
| Voice is a morale pit | Deferred to slice 4; LiveKit (not hand-rolled WebRTC) is non-negotiable |
| Shared-package drift (client/server types diverge) | All DTOs/events defined once in @oda/shared; server emits, client parses |

## Verification checkpoints

- After task 1: `npm run typecheck && npm run lint` green; `/api/health` responds.
- After task 4: register/login flow passes integration tests (fastify inject).
- After task 8: SPEC success criteria #1 and #2 demonstrated live.
- Slice boundaries 2–4: demo the slice's user-visible feature to one friend.

## Parallelizable vs sequential

Parallel: docker infra // shared contracts // client visual shell (against mock events).
Sequential: schema → auth → gateway → messages (each consumes the previous).
