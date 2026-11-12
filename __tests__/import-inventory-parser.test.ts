import ExcelJS from "exceljs";
import { parseWorkbook, validateRows } from "@/lib/import-inventory";

describe("importación de inventario: errores del Excel", () => {
  it("tolera encabezados vacíos y valores adicionales como los del archivo reportado", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Productos");
    sheet.addRow(["sku", "nombre", "descripcion", "precio", "cantidad", null, "costo_unitario", "fecha", "estado", "cuenta", null, 27.04528]);
    sheet.addRow(["ABC", "Producto", null, 100, 2, null, 50]);
    const parsed = await parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(parsed.error).toBeNull();
    expect(parsed.rows[0]).toMatchObject({ rowNumber: 2, costoUnitario: 50, errors: [] });
  });

  it("reporta errores con la fila real aunque haya filas vacías intermedias", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Productos");
    sheet.addRow(["sku", "cantidad", "costo_unitario"]);
    sheet.addRow(["ABC", 2, 50]);
    sheet.getRow(5).values = ["abc", "incorrecta", -1];
    const parsed = await parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    validateRows(parsed.rows);
    expect(parsed.rows.map((row) => row.rowNumber)).toEqual([2, 5]);
    expect(parsed.rows[1].errors).toEqual(expect.arrayContaining([
      "La cantidad debe ser un número entero mayor a 0",
      "El costo unitario debe ser un número mayor o igual a 0",
      "SKU duplicado en el archivo (filas 2, 5)",
    ]));
  });
});
