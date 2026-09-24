import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { WebhookHandlers } from "./webhookHandlers";
import { isStripeEnabled, rejectDisabledCapability } from "./lib/capabilities";

const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const configuredOrigins = new Set(
  (process.env.VAULTORA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const deploymentOrigins = new Set(
  [
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
    process.env.REPLIT_DEV_DOMAIN ?? "",
  ]
    .map((origin) => origin.trim())
    .filter(Boolean)
    .flatMap((origin) => (origin.startsWith("http") ? [origin] : [`https://${origin}`])),
);

function isAllowedOrigin(req: express.Request, origin: string): boolean {
  if (configuredOrigins.has(origin)) return true;
  const forwardedProtocol = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol)
    ?.split(",")[0]
    ?.trim() || req.protocol;
  const host = getClerkProxyHost(req);
  return Boolean(host && `${protocol}://${host}` === origin);
}

function csrfGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(req, origin)) {
    res.status(403).json({ error: "Cross-site request rejected" });
    return;
  }
  next();
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sensitive requests. Try again later." },
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, configuredOrigins.has(origin) || deploymentOrigins.has(origin));
    },
  }),
);
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!isStripeEnabled()) {
      rejectDisabledCapability(res, "stripe");
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }

    try {
      await WebhookHandlers.processWebhook(
        req.body as Buffer,
        Array.isArray(signature) ? signature[0] : signature,
      );
      res.status(200).json({ received: true });
    } catch (error) {
      req.log.error({ err: error }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook processing failed" });
    }
  },
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));

app.use("/api", apiLimiter);
app.use("/api", csrfGuard);
app.use("/api/funding-requests", sensitiveLimiter);
app.use("/api/kyc", sensitiveLimiter);
app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err: error }, "Unhandled request error");
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  res.status(statusCode).json({
    error: statusCode === 500 && process.env.NODE_ENV === "production"
      ? "Internal server error"
      : error instanceof Error
        ? error.message
        : "Request failed",
    requestId: req.id,
  });
});

export default app;
