import { useState } from "react";

export function Counter() {
  const [counter, setCounter] = useState(0);
  function handleClick() {
    setCounter((currentCount) => {
      return currentCount + 1;
    });
  }
  return (
    <div>
      <button onClick={handleClick}>Increment</button>
      <h1>{counter}</h1>
    </div>
  );
}
