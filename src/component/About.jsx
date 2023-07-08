import { React } from "react";
import { NameFunc } from "./exercise/NameFunc";
import { TodoListClass } from "./exercise/TodoListClass";
import { TodoListItem } from "./exercise/TodoListItem";
import { User } from "./exercise/User.jsx";
import { UserCard } from "./exercise/UserCard.jsx";
import { UserCardClass } from "./exercise/UserCardClass.jsx";
import user from "../assets/user.json";
import "../user.css";
import { StateThis } from "./exercise/StateThis.jsx";
import { StateThisClass } from "./exercise/StateThisClass.jsx";
import { Counter } from "./exercise/Counter.jsx";
import { CounterClass } from "./exercise/CounterClass.jsx";
import { InputFunc } from "./exercise/InputFunc.jsx";

function About() {
  return (
    <div className="container">
      <UserCard
        name={user[0].name}
        phoneNumber={user[0].phoneNumber}
        age={user[0].age}
        address={user[0].address}
      ></UserCard>
      <UserCardClass
        name={user[1].name}
        phoneNumber={user[1].phoneNumber}
        age={user[1].age}
        address={user[1].address}
      />
      <hr></hr>
      {/* <StateThis />
      <hr></hr>
      <StateThisClass />
      <hr></hr>
      <TodoListClass isComplete={true}> Item 1</TodoListClass>
      <TodoListItem> Item 2</TodoListItem>
      <NameFunc name="User1" age={20} isProgrammer>
        <span></span>
      </NameFunc>
      <NameFunc name="User2" isProgrammer={true} />
      <User name="Index" age="30"></User>
      <Counter />
      <hr></hr>
      {"18 - State In Class"}
      <CounterClass />
      <hr></hr>
      <InputFunc /> */}
    </div>
  );
}

export default About;
