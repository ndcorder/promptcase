import { createInterface } from "node:readline";
import { RpcHandler } from "./rpc.ts";
import type { RpcRequest, RpcNotification } from "./types.ts";

const repoRoot = process.argv[2] || process.env.PROMPTCASE_REPO || process.cwd();

async function main() {
  if (process.argv.includes("--version")) {
    console.log("promptcase-sidecar 0.1.0");
    process.exit(0);
  }

  const handler = new RpcHandler(repoRoot);
  await handler.init();

  const rl = createInterface({ input: process.stdin });

  async function handleLine(line: string): Promise<void> {
    if (!line.trim()) return;

    try {
      const request = JSON.parse(line) as RpcRequest;

      // Notifications (no id) don't expect a response
      if (!("id" in request)) {
        return;
      }

      const response = await handler.handle(request);
      process.stdout.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const errorResponse = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
          data: err instanceof Error ? err.message : String(err),
        },
      };
      process.stdout.write(JSON.stringify(errorResponse) + "\n");
    }
  }

  let queue = Promise.resolve();

  rl.on("line", (line: string) => {
    queue = queue.then(() => handleLine(line)).catch((err) => {
      console.error("Unhandled RPC error:", err);
    });
  });

  // Notify that we're ready
  const readyNotification: RpcNotification = {
    jsonrpc: "2.0",
    method: "ready",
    params: { repoRoot },
  };
  process.stdout.write(JSON.stringify(readyNotification) + "\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
