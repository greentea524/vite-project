import { useState } from "react";

export function InputFunc() {
  const [name, setName] = useState("Kyle");

  return (
    <div>
      <label htmlFor="input-func-name">Name</label>
      <input
        id="input-func-name"
        type="text"
        defaultValue={name}
        onChange={(e) => setName(e.target.value)}
      ></input>
    </div>
  );
}
