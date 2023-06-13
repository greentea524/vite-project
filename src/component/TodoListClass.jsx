import React from "react";

export class TodoListClass extends React.Component {
  render() {
    return (
      <label>
        <input type="checkbox" checked={this.props.isComplete}></input>
        {this.props.children}
      </label>
    );
  }
}
