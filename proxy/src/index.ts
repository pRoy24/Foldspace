import type { Server } from "node:http";

import { config } from "./config";
import { createApp } from "./server";

export async function startServer(): Promise<Server> {
  const app = await createApp();
  return app.listen(config.port, () => {
    console.log(`Foldspace proxy listening on port ${config.port}`);
  });
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start proxy server", error);
    process.exitCode = 1;
  });
}
