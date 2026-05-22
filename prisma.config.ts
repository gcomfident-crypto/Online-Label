import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://labelhub:labelhub_password@localhost:5432/labelhub?schema=public",
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
