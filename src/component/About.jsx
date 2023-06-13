import React from "react";
import { NameFunc } from "./NameFunc";
import { TodoListClass } from "./TodoListClass";
import { TodoListItem } from "./TodoListItem";

function About() {
  const myCustomLabel = <label htmlFor="inputId">abc</label>;
  return (
    <div className="container">
      <div className="large" id="largeDiv">
        {myCustomLabel}
        <input id="inputId" type="number" defaultValue={3}></input>
      </div>
      <TodoListClass isComplete={true}> something</TodoListClass>
      <TodoListItem>Todo Item 1</TodoListItem>
      <NameFunc name="abc" age={20} isProgrammer>
        <span></span>
      </NameFunc>
      <NameFunc name="def" isProgrammer={true} />
    </div>
  );
}

export default About;
