import { useState, useCallback } from "react";

export function useArray(initialValue) {
  const [array, setArray] = useState(initialValue);

  const push = useCallback((element) => {
    setArray((currentArray) => [...currentArray, element]);
  }, []);

  const replace = useCallback((index, newElement) => {
    setArray((currentArray) => {
      return [
        ...currentArray.slice(0, index),
        newElement,
        ...currentArray.slice(index + 1),
      ];
    });
  }, []);

  const filter = useCallback((callback) => {
    setArray((currentArray) => {
      return currentArray.filter(callback);
    });
  }, []);

  const remove = useCallback((index) => {
    setArray((currentArray) => {
      return [
        ...currentArray.slice(0, index),
        ...currentArray.slice(index + 1),
      ];
    });
  }, []);

  const clear = useCallback(() => {
    setArray([]);
  }, []);

  const reset = useCallback(() => {
    setArray(initialValue);
  }, [initialValue]);

  return { array, set: setArray, push, replace, filter, remove, clear, reset };
}
