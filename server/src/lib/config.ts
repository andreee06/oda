import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .default("postgresql://oda:oda-dev-only-change-me@localhost:5432/oda"),
});

export const config = Env.parse(process.env);
