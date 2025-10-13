import express from "express";
import type { Server } from "http";
import { connectToWebService } from "./services";

const DEFAULT_PORT = 3000;

function normalizePort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

export function createServer(): Server {
  const app = express();
  const requireAuthorization = process.env.REQUIRE_AUTHORIZATION !== "false";

  // Mount the facilitator routes on the root path.
  const router = connectToWebService({ requireAuthorization });
  app.use("/", router);

  const port = normalizePort(process.env.PORT);
  return app.listen(port, () => {
    console.log(`Foldspace Protocol server listening on port ${port}`);
  });
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  createServer();
}
