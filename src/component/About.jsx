import React from "react";
import { NameFunc } from "./NameFunc";
import { TodoListClass } from "./TodoListClass";
import { TodoListItem } from "./TodoListItem";
import { User } from "./User.jsx";
import { UserCard } from "./UserCard.jsx";
import { UserCardClass } from "./UserCardClass.jsx";
import user from "../assets/user.json";
import "../user.css";

function About() {
  const myCustomLabel = <label htmlFor="inputId">Input: </label>;

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
      <div className="large" id="largeDiv">
        {myCustomLabel}
        <input id="inputId" type="number" defaultValue={3}></input>
      </div>
      <TodoListClass isComplete={true}> Item 1</TodoListClass>
      <TodoListItem> Item 2</TodoListItem>
      <NameFunc name="User1" age={20} isProgrammer>
        <span></span>
      </NameFunc>
      <NameFunc name="User2" isProgrammer={true} />
      <User name="Index" age="30"></User>
    </div>
  );
}

export default About;
