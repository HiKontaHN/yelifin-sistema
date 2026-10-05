export async function uploadProductImage(file: Blob, kind: "product" | "variant") {
  const formData = new FormData();
  formData.append("file", file, "image.webp");
  formData.append("kind", kind);

  const response = await fetch("/api/upload", { method: "POST", body: formData });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "No se pudo subir la imagen");
  return result.url as string;
}

export async function deleteProductImage(url: string) {
  const response = await fetch("/api/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error("No se pudo eliminar la imagen");
}
