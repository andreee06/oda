import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .default("postgresql://oda:oda-dev-only-change-me@localhost:5432/oda"),
  MINIO_ENDPOINT: z.string().default("http://localhost:9000"),
  MINIO_ROOT_USER: z.string().default("oda"),
  MINIO_ROOT_PASSWORD: z.string().default("oda-dev-only-change-me"),
  MINIO_BUCKET: z.string().default("oda-media"),
  GIPHY_API_KEY: z.string().default(""),
});

export const config = Env.parse(process.env);
