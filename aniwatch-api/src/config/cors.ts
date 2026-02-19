import { cors } from "hono/cors";

export const corsConfig = cors({
    allowMethods: ["GET"],
    maxAge: 600,
    origin: "*",
});
