import { buildApp } from "./app.js";
import { config } from "./lib/config.js";

const app = await buildApp({ logger: true });

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
