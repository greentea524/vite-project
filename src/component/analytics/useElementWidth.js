import { useEffect, useRef, useState } from "react";

/**
 * Measured width of a container, so charts can lay out in real pixels.
 *
 * A viewBox alone would scale the type down with the chart, which is exactly
 * what makes a "responsive" chart unreadable on a phone. Falls back to
 * `fallback` where ResizeObserver is unavailable rather than rendering at zero.
 */
export function useElementWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const measure = () => {
      const next = node.clientWidth;
      if (next > 0) setWidth(next);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
