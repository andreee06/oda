# oda

A self-hosted, discord-ish group chat I'm building for me and my friends.

Partly because I wanted a place of our own, partly because I wanted to actually
learn how realtime apps work under the hood — websockets, session auth, an SFU
for voice — instead of just using discord's API for everything.

Still a work in progress, but the core of it works: you can register, make
servers and channels, and chat in real time.

## what works so far

- accounts (invite-code only, since it'll face the internet eventually)
- servers and text channels (create / rename / delete)
- realtime messages over websockets — no refreshing
- message history with pagination ("load older")
- member list, optimistic sending, reconnect with backoff
- tests for the whole backend (67 at last count)

## what's not done yet

- image/file uploads and animated avatars
- gif picker (tenor)
- link previews
- online presence + typing indicators
- voice channels (going to use self-hosted [LiveKit](https://livekit.io) —
  not crazy enough to hand-roll WebRTC)
- actual deployment (looking at oracle's free tier)

## stack

- **server**: node + typescript, fastify (REST) + ws (websocket gateway),
  postgres with prisma, argon2 for passwords
- **client**: react + vite + tailwind, zustand for state
- **shared**: one zod schema package (`packages/shared`) used by both sides, so
  the client and server can't drift apart on what a "message" is
- **infra**: docker compose for postgres / minio / livekit in dev

## running it

needs node 22+ and docker.

```bash
docker compose up -d                     # postgres, minio, livekit
npm install
npm run db:generate -w @oda/server       # prisma client
npm run db:migrate -w @oda/server
npm run db:seed -w @oda/server           # prints the owner login + an invite code
npm run dev                              # server on :3001, client on :5173
```

then open http://localhost:5173 and log in with the seeded owner account.
register a second account in another browser (or incognito) with the invite
code the seed printed, and chat with yourself like a normal person.

```bash
npm test            # all workspaces
npm run typecheck
npm run lint
```

## things that bit me (so you don't have to)

- prisma 7 is not prisma 6: no more rust engine, you need the pg driver
  adapter, the generated types are called `UserModel` not `User`, and
  `prisma generate` doesn't always run when you expect it to.
- fastify plugins are encapsulated. `app.decorate()` inside a plugin doesn't
  show up on the outside — cost me a test failure to learn that one.
- docker containers without `restart: unless-stopped` just silently stay dead
  after a docker daemon restart. that was a fun hour.
- cookies + a custom header on mutations is all you need for CSRF on an app
  like this. no token dance required.

## notes

`SPEC.md` is where I keep the actual scope decisions (what's in v1 and what
deliberately isn't), `tasks/todo.md` is my working list. The dev passwords in
`docker-compose.yml` are localhost-only on purpose — they get replaced before
this thing ever touches the public internet.
