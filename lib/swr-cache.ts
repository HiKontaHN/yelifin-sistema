export const swrCache = new Map();

export const createFetcher = () => {
  return async (url: string) => {
    const res = await fetch(url);

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Error en la solicitud');
    }

    return res.json();
  };
};
