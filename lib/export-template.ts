// lib/export-template.ts
// Genera la plantilla de importación (.xlsx) en el navegador con exceljs.
// exceljs (y no la lib xlsx ya instalada) porque la Community Edition de
// SheetJS no puede escribir data validations — y la columna cuenta necesita
// un dropdown nativo de Excel.
import ExcelJS from "exceljs";
import {
  TEMPLATE_COLUMNS,
  MAX_IMPORT_ROWS,
  buildAccountLabels,
} from "@/lib/import-labels";

export type TemplateAccount = { id: number; name: string };
export type TemplateProductRow = {
  sku: string;
  nombre: string;
  precio: number | null;
};

const INSTRUCTIONS: string[][] = [
  ["Plantilla de importación de productos e inventario"],
  [],
  ["Columna", "Uso"],
  ["sku", "Opcional. Si existe, la fila agrega inventario a ese producto/variante (nombre y precio se ignoran). Si no existe o va vacío, la fila crea un producto nuevo."],
  ["nombre", "Requerido para productos nuevos."],
  ["descripcion", "Opcional. Solo para productos nuevos."],
  ["precio", "Precio de venta. Requerido para productos nuevos."],
  ["cantidad", "Opcional. Unidades del lote. Sin cantidad, la fila solo crea el producto."],
  ["costo_unitario", "Requerido si hay cantidad. COSTO FINAL por unidad en Lempiras, con envío/importación incluidos — el sistema no convierte moneda ni reparte envío aquí. Compras en USD o con envío: usar el módulo de Compras."],
  ["fecha", "Opcional (dd/mm/aaaa). Fecha de compra/ingreso del lote — ordena el consumo FIFO. Vacía = hoy."],
  ["estado", "listo = inventario en mano, disponible para venta. pendiente = aún no llega; se crea una compra pendiente que confirmás al recibir la mercancía."],
  ["cuenta", "Opcional. La cuenta o tarjeta con la que compraste ESE lote (seleccionar del listado). Con cuenta se registra la compra y se debita el saldo AL IMPORTAR, también en pendientes. Sin cuenta = inventario inicial, no toca finanzas."],
  [],
  ["Importante:"],
  ["• Productos con variantes: usar el SKU de la variante, no el del producto."],
  ["• No incluyas como 'listo' unidades que ya están en una compra pendiente: se duplicarían al confirmarla."],
  [`• Máximo ${MAX_IMPORT_ROWS} filas por archivo.`],
];

export async function downloadImportTemplate(options: {
  accounts: TemplateAccount[];
  creditCards: TemplateAccount[];
  products?: TemplateProductRow[];
}): Promise<void> {
  const { accounts, creditCards, products } = options;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");

  // Encabezados
  sheet.addRow([...TEMPLATE_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = TEMPLATE_COLUMNS.map((col) => ({
    width: col === "cuenta" ? 32 : col === "nombre" || col === "descripcion" ? 28 : 14,
  }));
  // La columna fecha como texto para que dd/mm/aaaa no se auto-convierta raro
  sheet.getColumn(7).numFmt = "@";

  // Pre-llenado con productos registrados (una fila por producto/variante)
  if (products?.length) {
    for (const product of products) {
      sheet.addRow([product.sku, product.nombre, null, product.precio, null, null, null, null, null]);
    }
  }

  // Hoja oculta con las opciones de cuenta
  const accountLabels = [
    ...buildAccountLabels("account", accounts).map((a) => a.label),
    ...buildAccountLabels("credit_card", creditCards).map((c) => c.label),
  ];
  const listSheet = workbook.addWorksheet("_cuentas", { state: "hidden" });
  for (const label of accountLabels) listSheet.addRow([label]);

  // Data validations (dropdowns) para todas las filas posibles
  const lastRow = MAX_IMPORT_ROWS + 1;
  for (let rowIndex = 2; rowIndex <= lastRow; rowIndex++) {
    sheet.getCell(`H${rowIndex}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"listo,pendiente"'],
      showErrorMessage: true,
      errorTitle: "Estado inválido",
      error: "Seleccioná listo o pendiente",
    };
    if (accountLabels.length > 0) {
      sheet.getCell(`I${rowIndex}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'_cuentas'!$A$1:$A$${accountLabels.length}`],
        showErrorMessage: true,
        errorTitle: "Cuenta inválida",
        error: "Seleccioná una cuenta o tarjeta del listado",
      };
    }
  }

  // Hoja de instrucciones
  const helpSheet = workbook.addWorksheet("Instrucciones");
  for (const row of INSTRUCTIONS) helpSheet.addRow(row);
  helpSheet.getColumn(1).width = 18;
  helpSheet.getColumn(2).width = 110;
  helpSheet.getRow(1).font = { bold: true, size: 13 };
  helpSheet.getRow(3).font = { bold: true };
  helpSheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  // Descargar
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = products?.length
    ? "plantilla-importacion-mis-productos.xlsx"
    : "plantilla-importacion.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}
