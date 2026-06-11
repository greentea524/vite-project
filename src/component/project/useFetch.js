import { useQuery } from "@tanstack/react-query";

export function useFetch(url, options = {}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["fetch", url, options],
    enabled: Boolean(url),
    queryFn: async ({ signal }) => {
      const res = await fetch(url, { ...options, signal });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      return res.json();
    },
  });

  return { data, isLoading, isError };
}
