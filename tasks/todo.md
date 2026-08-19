# todo

## slice 1 — text mvp ✅ (done 2026-08-14)

- [x] repo scaffold + docker infra (postgres, minio, livekit)
- [x] shared zod contracts (`packages/shared`) + round-trip tests
- [x] prisma schema, first migration, seed (owner + "The Boys" + #general)
- [x] auth: register via invite code / login / logout / me — argon2id,
      session cookie, login rate limit, csrf header check
- [x] servers + channels rest (owner vs member vs outsider → 200/403/404)
- [x] websocket gateway: cookie auth on upgrade, READY, ping/pong heartbeat,
      per-channel + per-server dispatch
- [x] messages: post → broadcast MESSAGE_CREATE, cursor pagination (50/page)
- [x] client: login page, server rail / channel list / chat / member list,
      optimistic send with rollback, reconnect with backoff

## slice 2 — make it pretty ✅ (done 2026-08-17)

- [x] image uploads (minio, 8MB cap, mime allowlist, /media proxy)
- [x] avatars incl. animated gifs — user panel, member list, chat (live USER_UPDATE)
- [x] message attachments + inline image rendering
- [x] gif picker (giphy, server-proxied; needs GIPHY_API_KEY in server/.env — 503s gracefully without it)
  - note: originally tenor, but google killed the tenor api on 2026-06-30. migrated to giphy.
- [x] link embeds (OpenGraph unfurl, 3s timeout, best-effort)
- [x] custom server emoji (owner uploads, :shortcode: rendering, picker)

## slice 3 — social stuff ✅ (done 2026-08-19)

- [x] online/idle presence in member list (in-process hub, idle after 5min,
      multi-tab safe, self never echoed own status)
- [x] typing indicators (3s expiry, 2s throttle server+client, sender excluded)
- [x] proper invite-link UI (Invite.serverId, /invite/:code join page,
      register prefill via sessionStorage, accept for existing users,
      owner-only create/list/revoke)
- [x] ~~roles beyond owner/member~~ → deferred: SPEC freezes v1 at owner/member;
      a real role system is its own slice (CRUD, hierarchy, permissions)

## slice 4 — voice

- [ ] livekit token endpoint
- [ ] join/leave voice channels, mute/deafen, speaking indicator
- [ ] real livekit keys (dev uses devkey/secret)

## later / maybe

- message edit + delete ui (editedAt column already exists)
- reactions
- dms?
- screenshots in the readme once it looks like something
- deploy: oracle free tier (arm, 2cpu/12gb) or hetzner ~€6
