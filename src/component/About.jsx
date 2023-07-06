import React from "react";
import { NameFunc } from "./NameFunc";
import { TodoListClass } from "./TodoListClass";
import { TodoListItem } from "./TodoListItem";
import { User } from "./User.jsx";
import { UserCard } from "./UserCard.jsx";
import { UserCardClass } from "./UserCardClass.jsx";
import user from "../assets/user.json";
import "../user.css";
import { StateThis } from "./StateThis.jsx";
import { StateThisClass } from "./StateThisClass.jsx";
import { Counter } from "./Counter.jsx";
import { CounterClass } from "./CounterClass.jsx";

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
      <StateThis />
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
    </div>
  );
}

export default About;
