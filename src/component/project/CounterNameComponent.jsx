import { useState, useEffect } from "react";
// WDS 21 22

function CounterNameComponent() {
  const [name, setName] = useState("");
  const [age, setAge] = useState(0);
  const person = { name, age };
  useEffect(() => {
    const handler = () => {
      console.log(name, age);
    };
    document.addEventListener("click", handler);
    console.log("inside effect");
    return () => {
      console.log("cleanup effect");
      document.removeEventListener("click", handler);
    };
  }, [name, age]);

  return (
    <div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      ></input>
      <button
        onClick={() =>
          setAge((currentAge) => (currentAge - 1 > 0 ? currentAge - 1 : 0))
        }
      >
        -
      </button>
      {age}
      <button onClick={() => setAge((currentAge) => currentAge + 1)}>+</button>
      <br></br>
      My Name is {name} and I am {age} years old.
    </div>
  );
}

export default CounterNameComponent;
