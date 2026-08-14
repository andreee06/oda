import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "../src/lib/db.js";

/**
 * Idempotent dev seed: owner account + default server + #general + one invite.
 * Safe to run repeatedly. Override via ODA_SEED_OWNER_USERNAME / _PASSWORD.
 */
const username = process.env["ODA_SEED_OWNER_USERNAME"] ?? "owner";
const password = process.env["ODA_SEED_OWNER_PASSWORD"] ?? "oda-dev-password";

const owner = await prisma.user.upsert({
  where: { username },
  update: {},
  create: {
    username,
    displayName: username,
    passwordHash: await hash(password),
  },
});

let server = await prisma.server.findFirst({
  where: { ownerId: owner.id, name: "The Boys" },
});
if (!server) {
  server = await prisma.server.create({
    data: {
      name: "The Boys",
      ownerId: owner.id,
      members: { create: { userId: owner.id } },
      channels: { create: { name: "general", type: "text" } },
    },
  });
}

let invite = await prisma.invite.findFirst({ where: { creatorId: owner.id } });
if (!invite) {
  invite = await prisma.invite.create({
    data: {
      code: `oda-${randomBytes(3).toString("hex")}`,
      creatorId: owner.id,
      maxUses: 10,
    },
  });
}

console.log("Seed OK");
console.log(`  owner login:  ${username} / ${password}`);
console.log(`  server:       ${server.name} (#general)`);
console.log(`  invite code:  ${invite.code} (uses: ${invite.uses}/${invite.maxUses})`);

await prisma.$disconnect();
