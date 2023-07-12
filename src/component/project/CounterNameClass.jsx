import React from "react";
// WDS 21 22

export class CounterNameClass extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      name: "Bob",
      age: 100,
    };
  }
  render() {
    const updateName = (value) => {
      this.setState((currentState) => {
        return { name: value };
      });
    };
    const addCounter = (value) => {
      this.setState((currentState) => {
        return { age: currentState.age + value };
      });
    };
    return (
      <div>
        <input
          type="text"
          defaultValue={this.state.name}
          onChange={(e) => updateName(e.target.value)}
        ></input>
        <button onClick={() => addCounter(-1)}>-</button>
        {this.state.age}
        <button onClick={() => addCounter(1)}>+</button>
        <br></br>
        My Name is {this.state.name} and I am {this.state.age} years old.
      </div>
    );
  }
}
