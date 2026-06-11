import { useArray } from "./useArray";

const INITIAL_ARRAY = [1, 2, 3];
// const INITIAL_ARRAY = () => [1, 2, 3]

function HookUseArray() {
  const { array, set, push, replace, filter, remove, clear, reset } =
    useArray(INITIAL_ARRAY);

  return (
    <>
      <div>{array.join(", ")}</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: ".5rem",
          alignItems: "flex-start",
          marginTop: "1rem",
        }}
      >
        <button type="button" onClick={() => set([4, 5, 6])}>
          Set to [4, 5, 6]
        </button>
        <button type="button" onClick={() => push(4)}>
          Push 4
        </button>
        <button type="button" onClick={() => replace(1, 9)}>
          Replace the second element with 9
        </button>
        <button type="button" onClick={() => filter((n) => n < 3)}>
          Keep numbers less than 3
        </button>
        <button type="button" onClick={() => remove(1)}>
          Remove second element
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </div>
    </>
  );
}

export default HookUseArray;
