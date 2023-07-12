import React from "react";
// WDS 21 22

export class CounterNameClass extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      name: "Bob",
      age: 100,
    };

    this.handleDocumentClick = () => {
      console.log(this.state.name);
    };
  }
  componentDidMount() {
    console.log("ClassComponent Hi");
    console.log("ClassComponent Render");
  }
  componentWillUnmount() {
    console.log("ClassComponent Unmount");
    document.removeEventListener("click", this.handleDocumentClick);
    if (this.nameTimeout != null) clearTimeout(this.nameTimeout);
  }
  componentDidUpdate(prevProps, prevState) {
    console.log("ClassComponent Render");
    if (prevState.name !== this.state.name) {
      document.removeEventListener("click", this.handleDocumentClick);
      document.addEventListener("click", this.handleDocumentClick);

      if (this.nameTimeout != null) clearTimeout(this.nameTimeout);
      this.nameTimeout = setTimeout(() => {
        console.log("ClassComponent name changed");
      }, 1000);
    }
    if (
      prevState.name !== this.state.name ||
      prevState.age !== this.state.age
    ) {
      console.log(
        "My Name is " +
          this.state.name +
          " and I am " +
          this.state.age +
          " years old."
      );
    }
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
