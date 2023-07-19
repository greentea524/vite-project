import { useState, React, useEffect } from "react";
import ArrayStateProject from "./project/ArrayStateProject.jsx";
import CounterNameComponent from "./project/CounterNameComponent.jsx";
import { CounterNameClass } from "./project/CounterNameClass.jsx";
import TodoListProject from "./project/TodoListProject.jsx";
import CustomHook from "./project/CustomHook.jsx";
import UseArrayCustom from "./project/UseArrayCustom.jsx";

function TestProject() {
  const [shown, setShown] = useState(true);
  const childComponent = shown ? <CounterNameComponent /> : null;
  const childClass = shown ? <CounterNameClass /> : null;
  const [width, setWidth] = useState(window.innerWidth);
  const [height, setHeight] = useState(window.innerHeight);
  // empty [] = mount
  useEffect(() => {
    window.addEventListener("resize", () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    });
  }, []);
  return (
    <div className="container">
      <TodoListProject />
      <hr></hr>
      {/* <CustomHook /> */}
      <UseArrayCustom />
      <hr></hr>
      <button
        style={{ display: "block", marginBottom: "1rem" }}
        onClick={() => setShown((s) => !s)}
      >
        Show/Hide
      </button>
      {childComponent}
      {childClass}
      <hr></hr>
      <ArrayStateProject />
      <hr></hr>
      Width {width} x Height {height}
    </div>
  );
}

export default TestProject;
