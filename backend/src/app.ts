import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import pinoHttp from "pino-http";
import routes from "./routes";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { apiLimiter } from "./middleware/rateLimiter";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { swaggerSpec } from "./config/swagger";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    // In dev, the harness assigns the frontend an arbitrary free port on
    // every restart, so pinning CORS to one CLIENT_URL means it goes stale
    // on the next restart. Accept any localhost/127.0.0.1 origin instead —
    // still same-machine-only, never a real cross-site relaxation. In
    // production this stays locked to the configured CLIENT_URL.
    origin: env.isProduction ? env.clientUrl : /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());
app.use(pinoHttp({ logger, autoLogging: !env.isProduction ? { ignore: (req) => req.url === "/health" } : true }));
app.use("/api", apiLimiter);

app.get("/health", (_req, res) => res.json({ success: true, message: "OK", data: { status: "healthy" } }));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
