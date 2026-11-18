import { zodFormResolver } from "@/lib/zod-form-resolver";
import * as z from "zod";

describe("product form resolver compatibility", () => {
  it("returns field errors instead of throwing for empty required fields", async () => {
    const schema = z.object({
      name: z.string().trim().min(1, "El nombre es requerido"),
      price: z.string().trim().min(1, "El precio de venta es requerido"),
      sku: z.string().trim().min(1, "El SKU es requerido para productos"),
    });
    const result = await zodFormResolver(schema)(
      { name: " ", price: "", sku: "" },
      undefined,
      { fields: {}, shouldUseNativeValidation: false },
    );
    expect(result.errors).toMatchObject({
      name: { message: "El nombre es requerido" },
      price: { message: "El precio de venta es requerido" },
      sku: { message: "El SKU es requerido para productos" },
    });
    expect(result.values).toEqual({});
  });
});
