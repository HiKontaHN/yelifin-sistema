const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolEnd = jest.fn();
const mockPoolConnect = jest.fn(async () => ({
  query: mockClientQuery,
  release: mockClientRelease,
}));
const mockPoolConstructor = jest.fn(() => ({
  connect: mockPoolConnect,
  end: mockPoolEnd,
}));
const mockNeonConfig: { webSocketConstructor?: unknown } = {};

jest.mock("@neondatabase/serverless", () => ({
  neonConfig: mockNeonConfig,
  Pool: mockPoolConstructor,
}));

import { withTransaction } from "@/lib/db-transaction";

describe("withTransaction", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL =
      "postgresql://user:password@example.neon.tech/database?sslmode=require";
  });

  afterAll(() => {
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("usa una sola conexión y confirma el callback completo", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await withTransaction(async (tx) => {
      const [row] = await tx<{ id: number }>`
        INSERT INTO demo (value) VALUES (${42}) RETURNING id
      `;
      return row.id;
    });

    expect(result).toBe(7);
    expect(mockClientQuery.mock.calls[0]).toEqual(["BEGIN"]);
    expect(mockClientQuery.mock.calls[1][0]).toContain(
      "INSERT INTO demo (value) VALUES ($1) RETURNING id",
    );
    expect(mockClientQuery.mock.calls[1][1]).toEqual([42]);
    expect(mockClientQuery.mock.calls[2]).toEqual(["COMMIT"]);
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });

  it("revierte y vuelve a lanzar el error si falla una consulta", async () => {
    const failure = new Error("falló la escritura");
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      withTransaction(async (tx) => {
        await tx`UPDATE demo SET value = ${99}`;
      }),
    ).rejects.toBe(failure);

    expect(mockClientQuery.mock.calls[0]).toEqual(["BEGIN"]);
    expect(mockClientQuery.mock.calls[2]).toEqual(["ROLLBACK"]);
    expect(mockClientQuery).not.toHaveBeenCalledWith("COMMIT");
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });
});
