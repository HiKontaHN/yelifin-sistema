"use client";

import { useEffect, useState } from "react";
import { isCatalogStockEvent, type CatalogStock } from "@/lib/catalog-stock";

export type CatalogStockStatus = "checking" | "live" | "updated" | "offline" | "unavailable";

export function useCatalogStock(catalogId: string, initialStock: CatalogStock, connectRealtime: boolean, enabled: boolean) {
  const [stock, setStock] = useState(initialStock);
  const [status, setStatus] = useState<CatalogStockStatus>("checking");

  useEffect(() => {
    if (!enabled) return;

    const path = `/api/catalog/${catalogId}/stock`;
    let disposed = false;
    let unavailable = false;
    let live = false;
    let socket: WebSocket | null = null;
    let request: AbortController | null = null;
    let reconnectTimer: number | undefined;
    let socketTimeout: number | undefined;
    let retryDelay = 1000;

    const closeAsUnavailable = () => {
      unavailable = true;
      setStock({});
      setStatus("unavailable");
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(socketTimeout);
      socket?.close();
    };

    const refresh = async () => {
      if (disposed || unavailable || live || request || document.visibilityState === "hidden") return;
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(path, { cache: "no-store", signal: controller.signal });
        if (disposed || live || unavailable) return;
        if (response.status === 404) {
          closeAsUnavailable();
          return;
        }
        if (!response.ok) throw new Error("No se pudo consultar el inventario");
        const data: unknown = await response.json();
        if (disposed || live || unavailable) return;
        if (!isCatalogStockEvent(data) || data.type !== "stock") throw new Error("Inventario inválido");
        setStock(data.stock);
        setStatus("updated");
      } catch {
        if (!disposed && !live && !unavailable && !controller.signal.aborted) setStatus("offline");
      } finally {
        request = null;
      }
    };

    const connect = () => {
      if (disposed || unavailable) return;
      const endpoint = new URL(path, window.location.origin);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      const connection = new WebSocket(endpoint.href);
      socket = connection;
      socketTimeout = window.setTimeout(() => connection.close(), 8000);

      connection.addEventListener("message", (event) => {
        if (disposed || unavailable || socket !== connection || typeof event.data !== "string") return;
        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!isCatalogStockEvent(data)) return;
        if (data.type === "unavailable") {
          closeAsUnavailable();
          return;
        }
        if (data.type === "stock") {
          setStock(data.stock);
          setStatus("live");
          live = true;
          retryDelay = 1000;
          request?.abort();
        }
        if (live) {
          window.clearTimeout(socketTimeout);
          socketTimeout = window.setTimeout(() => connection.close(), 55_000);
        }
      });

      connection.addEventListener("error", () => connection.close());
      connection.addEventListener("close", () => {
        if (disposed || unavailable || socket !== connection) return;
        socket = null;
        live = false;
        window.clearTimeout(socketTimeout);
        setStatus("checking");
        void refresh();
        reconnectTimer = window.setTimeout(connect, retryDelay + Math.random() * 300);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      });
    };

    if (connectRealtime) connect();
    else void refresh();

    const periodicCheck = window.setInterval(refresh, 12_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);

    return () => {
      disposed = true;
      request?.abort();
      socket?.close();
      window.clearInterval(periodicCheck);
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(socketTimeout);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [catalogId, connectRealtime, enabled]);

  return { stock, status };
}
