import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogCartSheet } from "@/components/catalog/catalog-cart-sheet";

jest.mock("@/components/ui/sheet", () => {
  const ShowChildren = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    Sheet: ShowChildren,
    SheetContent: ShowChildren,
    SheetDescription: ShowChildren,
    SheetFooter: ShowChildren,
    SheetHeader: ShowChildren,
    SheetTitle: ShowChildren,
    SheetTrigger: ShowChildren,
  };
});

const instagram = "https://www.instagram.com/tienda/";
const whatsapp = "https://wa.me/50499999999";

test.each([
  { name: "sin redes", contacts: { instagram: null, whatsapp: null } },
  { name: "solo Instagram", contacts: { instagram, whatsapp: null } },
  { name: "solo WhatsApp", contacts: { instagram: null, whatsapp } },
  { name: "ambas redes", contacts: { instagram, whatsapp } },
])("muestra las opciones de compartir con $name", ({ contacts }) => {
  const html = renderToStaticMarkup(
    <CatalogCartSheet
      contacts={contacts}
      lines={[{ id: "taza", name: "Taza", quantity: 1, price: 100, available: 3, isService: false }]}
      formatter={new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" })}
      setQuantity={() => {}}
    />,
  );

  expect(html).toContain("Copiar lista");
  expect(html.includes('href="https://wa.me/50499999999?text=')).toBe(Boolean(contacts.whatsapp));
  expect(html.includes('href="https://ig.me/m/tienda"')).toBe(Boolean(contacts.instagram));
  expect(html.includes("En Instagram, pega el mensaje manualmente")).toBe(Boolean(contacts.instagram));
});
