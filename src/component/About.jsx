import { React } from "react";
import { NameFunc } from "./exercise/NameFunc";
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
      <center>
        {import.meta.env.VITE_TEXT}{" "}
        <ul>
          {user.map((u) => {
            return <UserCard key={u.id} {...u}></UserCard>;
          })}
        </ul>
      </center>

      <hr></hr>
      {/* <StateThis />
      <hr></hr>
      <StateThisClass />
      <hr></hr>

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
