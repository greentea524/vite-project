import { useState } from "react";

export function InputFunc() {
  const [name, setName] = useState("Kyle");

  return (
    <div>
      <input
        type="text"
        defaultValue={name}
        onChange={(e) => setName(e.target.value)}
      ></input>
    </div>
  );
}
