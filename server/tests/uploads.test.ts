import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";
import { buildApp } from "../src/app.js";
import { cleanDb, setupUser } from "./helpers.js";

const CLIENT_HEADERS = { "x-oda-client": "web" };

let app: FastifyInstance;

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function multipartBody(
  filename: string,
  contentType: string,
  data: Buffer,
): { body: Buffer; contentTypeHeader: string } {
  const boundary = "----odatestboundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="${filename}"\r\ncontent-type: ${contentType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    body,
    contentTypeHeader: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("POST /api/uploads", () => {
  beforeEach(async () => {
    await cleanDb();
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("stores an image in MinIO and returns a /media URL", async () => {
    const { cookie } = await setupUser(app, "alice");
    const { body, contentTypeHeader } = multipartBody("a.png", "image/png", PNG);

    const res = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: { ...CLIENT_HEADERS, "content-type": contentTypeHeader },
      cookies: { oda_session: cookie },
      body,
    });

    expect(res.statusCode).toBe(201);
    const { url } = res.json();
    expect(url).toMatch(/^\/media\/oda-media\/.+\.png$/);

    // and the object is actually fetchable from MinIO (public-read bucket)
    const objectPath = url.replace("/media", "");
    const fetched = await fetch(`http://localhost:9000${objectPath}`);
    expect(fetched.status).toBe(200);
    const bytes = Buffer.from(await fetched.arrayBuffer());
    expect(bytes.length).toBe(PNG.length);
  });

  it("rejects disallowed content types with 415", async () => {
    const { cookie } = await setupUser(app, "alice");
    const { body, contentTypeHeader } = multipartBody(
      "evil.sh",
      "application/x-sh",
      Buffer.from("echo hi"),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: { ...CLIENT_HEADERS, "content-type": contentTypeHeader },
      cookies: { oda_session: cookie },
      body,
    });
    expect(res.statusCode).toBe(415);
  });

  it("requires authentication (401)", async () => {
    const { body, contentTypeHeader } = multipartBody("a.png", "image/png", PNG);
    const res = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: { ...CLIENT_HEADERS, "content-type": contentTypeHeader },
      body,
    });
    expect(res.statusCode).toBe(401);
  });
});
