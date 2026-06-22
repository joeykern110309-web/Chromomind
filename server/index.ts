import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import FileStore from "session-file-store";
import { passport } from "./auth";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const FileStoreSession = FileStore(session);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Persistent file-based sessions — survive server restarts
app.use(
  session({
    store: new FileStoreSession({
      path: "./data/sessions",
      ttl: 60 * 60 * 24 * 30, // 30 days
      retries: 0,
      logFn: () => {}, // suppress verbose file-store logs
    }),
    secret: process.env.SESSION_SECRET || "chromomind-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
})();
