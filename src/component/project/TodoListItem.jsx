import { useContext, useState, useRef, useEffect } from "react";
import { TodoContext } from "./TodoContext";

export function TodoListItem({ id, name, completed }) {
  const { toggleTodo, deleteTodo, updateTodoName } = useContext(TodoContext);
  const [isEditing, setIsEditing] = useState(false);
  const nameRef = useRef();

  useEffect(() => {
    if (isEditing && nameRef.current) {
      nameRef.current.focus();
    }
  }, [isEditing]);

  function handleSubmit(e) {
    e.preventDefault();
    if (nameRef.current.value === "") return;
    updateTodoName(id, nameRef.current.value);
    setIsEditing(false);
  }
  return (
    <li className="list-item">
      {isEditing ? (
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            defaultValue={name}
            ref={nameRef}
            aria-label="Todo name"
          />
          <button type="submit" data-button-edit>
            Save
          </button>
        </form>
      ) : (
        <>
          <label className="list-item-label">
            <input
              checked={completed}
              type="checkbox"
              data-list-item-checkbox
              onChange={(e) => toggleTodo(id, e.target.checked)}
            />{" "}
            <span data-list-item-text>{name}</span>
          </label>
          <button
            type="button"
            data-button-edit
            onClick={() => setIsEditing(true)}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => deleteTodo(id)}
            data-button-delete
          >
            Delete
          </button>
        </>
      )}
    </li>
  );
}
