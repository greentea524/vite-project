import { useState } from "react";

function slowGetter() {
  return "Kyle";
}
export function StateThis() {
  const [name, setName] = useState(slowGetter);
  const [age, setAge] = useState(30);

  function handleClick() {
    setName("Sally");
    setAge((currentAge) => {
      return currentAge + 1;
    });
    setAge((currentAge) => {
      return currentAge + 1;
    });
  }
  return (
    <div>
      <button onClick={handleClick}>Click</button>
      <h1>
        Hello {name} {age}
      </h1>
    </div>
  );
}
