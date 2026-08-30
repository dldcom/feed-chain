import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { fileURLToPath } from "node:url";
import { EcosystemRoom } from "./rooms/EcosystemRoom.js";

const port = Number.parseInt(process.env.PORT ?? "2567", 10);

const server = defineServer({
  transport: new WebSocketTransport(),
  auth: false,
  rooms: {
    ecosystem: defineRoom(EcosystemRoom),
  },
  express: (app) => {
    app.get("/health", (_request: unknown, response: { json: (value: unknown) => void }) => {
      response.json({ ok: true, service: "feed-chain-server" });
    });
    if (process.env.NODE_ENV === "production") {
      app.use(express.static(fileURLToPath(new URL("../../client/dist", import.meta.url))));
    }
  },
});

await server.listen(port);
console.log(`[feed-chain] server listening on http://localhost:${port}`);
