import { Client } from "@neondatabase/serverless";
import WebSocket from "ws";

import type { CatalogStockEvent } from "@/lib/catalog-stock";
import { readPublicCatalogStock } from "@/lib/public-catalog-stock";

const CHANNEL = "hikonta_catalog_changed";
const REFRESH_DELAY = 150;
const CHECK_INTERVAL = 25_000;
const FALLBACK_INTERVAL = 6_000;
const HEARTBEAT = JSON.stringify({ type: "heartbeat" } satisfies CatalogStockEvent);
const UNAVAILABLE = JSON.stringify({ type: "unavailable" } satisfies CatalogStockEvent);

type Room = {
  catalogId: string;
  orgId: string;
  sockets: Set<WebSocket>;
  frame?: string;
  timer?: ReturnType<typeof setTimeout>;
  nextRefresh: number;
  refreshing: boolean;
  dirty: boolean;
};

const rooms = new Map<string, Room>();
let listener: Client | undefined;
let listening = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

// LISTEN pertenece a una sesión. La URL de Neon sin -pooler llega al mismo
// compute que DATABASE_URL y conserva esa sesión durante la suscripción.
function readDirectDatabaseUrl() {
  const configured = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL;
  if (!configured) return;
  const url = new URL(configured);
  if (url.hostname.endsWith(".neon.tech")) {
    url.hostname = url.hostname.replace(/-pooler\./, ".");
  }
  return url.href;
}

function roomIsActive(room: Room) {
  return rooms.get(room.catalogId) === room && room.sockets.size > 0;
}

function scheduleRefresh(room: Room, delay: number) {
  if (!roomIsActive(room)) return;
  if (room.refreshing) {
    room.dirty = true;
    return;
  }
  const nextRefresh = Date.now() + delay;
  if (room.timer && room.nextRefresh <= nextRefresh) return;
  clearTimeout(room.timer);
  room.nextRefresh = nextRefresh;
  room.timer = setTimeout(() => {
    room.timer = undefined;
    void refresh(room);
  }, delay);
}

function send(socket: WebSocket, frame: string) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > 256_000) {
    socket.terminate();
    return;
  }
  socket.send(frame);
}

async function refresh(room: Room) {
  if (!roomIsActive(room)) return;
  room.refreshing = true;
  let delay = listening ? CHECK_INTERVAL : FALLBACK_INTERVAL;

  try {
    const stock = await readPublicCatalogStock(room.catalogId);
    if (!roomIsActive(room)) return;
    if (!stock) {
      for (const socket of room.sockets) {
        send(socket, UNAVAILABLE);
        socket.close(1008, "Catálogo no disponible");
      }
      return;
    }
    const frame = JSON.stringify({ type: "stock", stock } satisfies CatalogStockEvent);
    const update = frame === room.frame ? HEARTBEAT : frame;
    room.frame = frame;
    for (const socket of room.sockets) send(socket, update);
  } catch {
    delay = FALLBACK_INTERVAL;
  } finally {
    const needsRefresh = room.dirty;
    room.refreshing = false;
    room.dirty = false;
    scheduleRefresh(room, needsRefresh ? REFRESH_DELAY : delay);
  }
}

function scheduleListenerReconnect() {
  if (rooms.size === 0 || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    startListener();
  }, FALLBACK_INTERVAL);
}

function startListener() {
  if (listener || rooms.size === 0) return;
  let connectionString: string | undefined;
  try {
    connectionString = readDirectDatabaseUrl();
  } catch {
    return;
  }
  if (!connectionString) return;

  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  client.neonConfig.webSocketConstructor = WebSocket;
  listener = client;

  const disconnect = () => {
    if (listener !== client) return;
    listener = undefined;
    listening = false;
    void client.end().catch(() => undefined);
    for (const room of rooms.values()) scheduleRefresh(room, 0);
    scheduleListenerReconnect();
  };

  client.on("error", disconnect);
  client.on("end", disconnect);
  client.on("notification", ({ channel, payload }) => {
    if (channel !== CHANNEL || !payload) return;
    for (const room of rooms.values()) {
      if (room.orgId === payload) scheduleRefresh(room, REFRESH_DELAY);
    }
  });

  void (async () => {
    try {
      await client.connect();
      if (listener !== client) return;
      await client.query("LISTEN hikonta_catalog_changed");
      if (listener !== client) return;
      listening = true;
      // La primera lectura después de LISTEN cubre cambios durante la conexión.
      for (const room of rooms.values()) scheduleRefresh(room, 0);
    } catch {
      disconnect();
    }
  })();
}

export function attachCatalogStockSocket(socket: WebSocket, catalogId: string, orgId: string) {
  let room = rooms.get(catalogId);
  if (!room) {
    room = { catalogId, orgId, sockets: new Set(), nextRefresh: 0, refreshing: false, dirty: false };
    rooms.set(catalogId, room);
  }

  const joinedRoom = room;
  const detach = () => {
    if (!joinedRoom.sockets.delete(socket) || joinedRoom.sockets.size > 0) return;
    clearTimeout(joinedRoom.timer);
    rooms.delete(catalogId);
    if (rooms.size > 0) return;

    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    const closingListener = listener;
    listener = undefined;
    listening = false;
    void closingListener?.end().catch(() => undefined);
  };

  room.sockets.add(socket);
  socket.once("close", detach);
  socket.on("error", () => {
    detach();
    socket.terminate();
  });
  socket.once("message", () => socket.close(1008, "Canal de solo lectura"));
  if (room.frame) send(socket, room.frame);
  startListener();
  scheduleRefresh(room, 0);
}
