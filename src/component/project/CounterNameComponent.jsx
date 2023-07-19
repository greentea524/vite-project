import { useState, useEffect, useReducer } from "react";

const ACTIONS = {
  INCREMENT: "INCREMENT",
  DECREMENT: "DECREMENT",
  RESET: "RESET",
  ADDFIVE: "ADDFIVE",
};
function reducer(age, action) {
  switch (action.type) {
    case ACTIONS.INCREMENT:
      return age + 1;
    case ACTIONS.DECREMENT:
      return age - 1;
    case ACTIONS.RESET:
      return 0;
    case ACTIONS.ADDFIVE:
      return age + action.payload.value;
    default:
      return age;
  }
}
function CounterNameComponent() {
  const [name, setName] = useState("");
  //const [age, setAge] = useState(0);
  const [age, dispatch] = useReducer(reducer, 0);

  useEffect(() => {
    console.log("I am " + age + " years old.");
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
      <button onClick={() => dispatch({ type: ACTIONS.DECREMENT })}>-</button>
      {age}
      <button onClick={() => dispatch({ type: ACTIONS.INCREMENT })}>+</button>
      <button
        onClick={() =>
          dispatch({ type: ACTIONS.ADDFIVE, payload: { value: 5 } })
        }
      >
        +5
      </button>
      <button onClick={() => dispatch({ type: ACTIONS.RESET })}>Reset</button>
      <br></br>
      {name != "" && `My Name is ${name} and I am ${age} years old.`}
    </div>
  );
}

export default CounterNameComponent;
