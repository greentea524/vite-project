import { useState, useEffect } from "react";
// WDS 21 22

function CounterNameComponent() {
  const [name, setName] = useState("");
  const [age, setAge] = useState(0);
  const person = { name, age };
  useEffect(() => {
    console.log("I am " + age + " years old.");
    // const handler = () => {
    //   console.log("My Name is " + name + " and I am " + age + " years old.");
    // };
    // document.addEventListener("click", handler);

    // return () => {
    //   console.log("Bye");
    //   document.removeEventListener("click", handler);
    // };
  }, [name, age]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      console.log("My Name is " + name);
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [name]);
  useEffect(() => {
    console.log("Hi");
    return () => {
      console.log("Bye");
    };
  }, []);

  useEffect(() => {
    console.log("re-render");
  });

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
      {name != "" && `My Name is ${name} and I am ${age} years old.`}
    </div>
  );
}

export default CounterNameComponent;
