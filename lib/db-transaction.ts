import {
  neonConfig,
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "@neondatabase/serverless";
import ws from "ws";

// El runtime de Node usado por algunos despliegues todavía no expone un
// WebSocket global. El driver de Neon permite proporcionar el constructor
// explícitamente y reutiliza esta configuración para cada Pool.
neonConfig.webSocketConstructor = ws;

export type TransactionSql = <T extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>;

function createTransactionSql(client: PoolClient): TransactionSql {
  return async <T extends QueryResultRow = QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }

    const result = await client.query<T>(text, values);
    return result.rows;
  };
}

/**
 * Ejecuta todas las consultas del callback en la misma conexión y transacción.
 * El Pool vive únicamente durante la solicitud, como requiere Neon en runtimes
 * serverless, y siempre se cierra para no agotar conexiones.
 */
export async function withTransaction<T>(
  callback: (sql: TransactionSql) => Promise<T>,
): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada");
  }

  const pool = new Pool({ connectionString, max: 1 });
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await callback(createTransactionSql(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("No se pudo revertir la transacción:", rollbackError);
      }
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}
