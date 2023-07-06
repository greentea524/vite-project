import { useState } from "react";
// WDS 20
const INIT_VALUE = ["A", "B", "C"];

function ArrayStateProject() {
  const [array, setArray] = useState(INIT_VALUE);
  const [value, setInput] = useState("");
  function removeFirstElement() {
    setArray((currentArray) => {
      return currentArray.slice(1);
    });
  }
  function addLetterToStart(letter) {
    setArray((currentArray) => {
      return [letter, ...currentArray];
    });
  }
  function addLetterToEnd(letter) {
    setArray((currentArray) => {
      return [...currentArray, letter];
    });
  }
  function removeSpecificElement(letter) {
    setArray((currentArray) => {
      return currentArray.filter((element) => element !== letter);
    });
  }
  function clearTheArray() {
    setArray((currentArray) => {
      return (currentArray = []);
    });
  }
  function resetTheArray() {
    setArray((currentArray) => {
      return (currentArray = INIT_VALUE);
    });
  }
  function updateBtoLetter(letter) {
    setArray((currentArray) => {
      return currentArray.map((element) => {
        if (element === "B") return letter;
        return element;
      });
    });
  }
  function addInputToArray(value) {
    setArray((currentArray) => {
      return [value, ...currentArray];
    });
  }
  function addLetterAtIndex(letter, index) {
    setArray((currentArray) => {
      return [
        ...currentArray.slice(0, index),
        letter,
        ...currentArray.slice(index),
      ];
    });
  }

  return (
    <div>
      <button onClick={removeFirstElement}>Remove First Element</button>
      <button onClick={() => removeSpecificElement("B")}>
        Remove B's Element
      </button>
      <button onClick={() => addLetterToStart("B")}>Add To Start</button>
      <button onClick={() => addLetterToEnd("B")}>Add To End</button>
      <br></br>
      <button onClick={() => updateBtoLetter("H")}>Update B to H</button>
      <button onClick={() => addLetterAtIndex("C", 2)}>Update C at 2</button>
      <input
        type="text"
        value={value}
        onChange={(e) => setInput(e.target.value)}
      ></input>
      <button onClick={() => addInputToArray(value)}>Add Value</button>
      <br></br>
      <button onClick={clearTheArray}>Clear</button>
      <button onClick={resetTheArray}>Reset</button>
      <br></br>
      {array.join(", ")}
    </div>
  );
}

export default ArrayStateProject;
