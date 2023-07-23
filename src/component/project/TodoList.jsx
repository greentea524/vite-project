import { useContext } from "react";
import { TodoListItem } from "./TodoListItem.jsx";
import { TodoContext } from "./TodoListProject.jsx";

export function TodoList() {
  const { todos } = useContext(TodoContext);
  return (
    <ul id="list">
      {todos.map((todo) => {
        return <TodoListItem key={todo.id} {...todo} />;
      })}
    </ul>
  );
}
