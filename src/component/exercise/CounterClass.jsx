import React from "react";

export class CounterClass extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      counter: 0,
    };
  }
  render() {
    const handleClick = () => {
      this.setState((currentState) => {
        return { counter: currentState.counter + 1 };
      });
    };
    return <div onClick={handleClick}>Count {this.state.counter}</div>;
  }
}
