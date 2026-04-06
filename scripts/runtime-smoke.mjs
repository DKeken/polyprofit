import { access, readFile } from "node:fs/promises";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readText(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

async function readConfig() {
  const file = await readText("../config.toml");
  const portMatch = file.match(/\[server\][\s\S]*?port\s*=\s*(\d+)/m);
  const frontendDistMatch = file.match(/\[server\][\s\S]*?frontend_dist\s*=\s*"([^"]+)"/m);

  if (!portMatch) throw new Error("Could not parse [server].port from config.toml");
  if (!frontendDistMatch) throw new Error("Could not parse [server].frontend_dist from config.toml");

  return {
    port: Number(portMatch[1]),
    frontendDist: frontendDistMatch[1],
  };
}

async function main() {
  const { port, frontendDist } = await readConfig();
  assert(Number.isInteger(port) && port > 0, "server.port must be a positive integer");

  const apiClient = await readText("../frontend/src/api.ts");
  const serverApi = await readText("../crates/pp-server/src/api.rs");
  const serverLib = await readText("../crates/pp-server/src/lib.rs");

  for (const route of [
    "/api/config",
    "/api/markets",
    "/api/analytics",
    "/api/db/stats",
    "/api/pnl-history",
    "/api/trades/export",
    "/api/pause",
    "/api/resume",
    "/api/kill",
  ]) {
    assert(apiClient.includes(route), `frontend api client is missing ${route}`);
  }

  for (const backendRoute of [
    'route("/config"',
    'route("/markets"',
    'route("/analytics"',
    'route("/db/stats"',
    'route("/pnl-history"',
    'route("/trades/export"',
    'route("/pause"',
    'route("/resume"',
    'route("/kill"',
  ]) {
    assert(serverApi.includes(backendRoute), `backend api router is missing ${backendRoute}`);
  }

  assert(
    serverLib.includes('.fallback_service(ServeDir::new(&config.server.frontend_dist))'),
    "server must serve frontend_dist as static fallback",
  );

  const frontendEntry = path.resolve(path.dirname(new URL("../config.toml", import.meta.url).pathname), frontendDist, "index.html");
  await access(frontendEntry);

  console.log("runtime smoke passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
