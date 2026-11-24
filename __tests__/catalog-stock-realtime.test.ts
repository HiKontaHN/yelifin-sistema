import { EventEmitter } from "node:events";
import type WebSocket from "ws";

const mockReadStock = jest.fn();
const mockListener = Object.assign(new EventEmitter(), {
  connect: jest.fn(async () => undefined),
  query: jest.fn(async () => undefined),
  end: jest.fn(async () => undefined),
  neonConfig: {},
});
const mockNewClient = jest.fn(() => mockListener);

jest.mock("@neondatabase/serverless", () => ({
  Client: mockNewClient,
}));
jest.mock("@/lib/public-catalog-stock", () => ({
  readPublicCatalogStock: (...args: unknown[]) => mockReadStock(...args),
}));

import { attachCatalogStockSocket } from "@/lib/catalog-stock-realtime";

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = jest.fn();

  close() {
    this.readyState = 3;
    this.emit("close");
  }
}

const catalogA = "8bd6f0d1-9ab8-4d03-9a85-1a82b18145a1";
const catalogB = "8bd6f0d1-9ab8-4d03-9a85-1a82b18145a2";
const lineId = "8bd6f0d1-9ab8-4d03-9a85-1a82b18145a3";

describe("suscripciones de inventario del catálogo", () => {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DATABASE_URL_UNPOOLED;
  let sockets: Socket[];

  function attach(catalogId: string, orgId: string) {
    const socket = new Socket();
    sockets.push(socket);
    attachCatalogStockSocket(socket as unknown as WebSocket, catalogId, orgId);
    return socket;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockListener.removeAllListeners();
    sockets = [];
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL = "postgresql://example:example@test-pooler.us-east-2.aws.neon.tech/example";
  });

  afterEach(() => {
    sockets.forEach((socket) => socket.close());
    jest.useRealTimers();
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;
    if (directUrl === undefined) delete process.env.DATABASE_URL_UNPOOLED;
    else process.env.DATABASE_URL_UNPOOLED = directUrl;
  });

  it("envía los cambios únicamente a los catálogos de la organización notificada", async () => {
    let aQuantity = 4;
    mockReadStock.mockImplementation(async (id) => ({ [lineId]: id === catalogA ? aQuantity : 8 }));
    const socketA = attach(catalogA, "11");
    const socketB = attach(catalogB, "22");
    await jest.advanceTimersByTimeAsync(200);
    expect(mockNewClient).toHaveBeenCalledTimes(1);
    expect(mockNewClient).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: expect.stringContaining("@test.us-east-2.aws.neon.tech/"),
    }));
    expect(mockListener.query).toHaveBeenCalledWith("LISTEN hikonta_catalog_changed");
    expect(socketA.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "stock", stock: { [lineId]: 4 } }));
    expect(socketB.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "stock", stock: { [lineId]: 8 } }));

    socketA.send.mockClear();
    socketB.send.mockClear();
    aQuantity = 1;
    mockListener.emit("notification", { channel: "hikonta_catalog_changed", payload: "11" });
    await jest.advanceTimersByTimeAsync(200);

    expect(socketA.send).toHaveBeenCalledWith(JSON.stringify({ type: "stock", stock: { [lineId]: 1 } }));
    expect(socketB.send).not.toHaveBeenCalled();
  });

  it("deja de transmitir y cierra la sesión de base al invalidar el enlace", async () => {
    mockReadStock.mockResolvedValue({ [lineId]: 4 });
    const socket = attach(catalogA, "11");
    await jest.advanceTimersByTimeAsync(200);

    mockReadStock.mockResolvedValue(null);
    mockListener.emit("notification", { channel: "hikonta_catalog_changed", payload: "11" });
    await jest.advanceTimersByTimeAsync(200);

    expect(socket.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "unavailable" }));
    expect(socket.readyState).toBe(3);
    expect(mockListener.end).toHaveBeenCalledTimes(1);
  });
});
