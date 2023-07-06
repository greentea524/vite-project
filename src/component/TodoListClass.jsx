import React from "react";

export class TodoListClass extends React.Component {
  render() {
    return (
      <label>
        <input type="checkbox" defaultChecked={this.props.isComplete}></input>
        {this.props.children}
      </label>
    );
  }
}
