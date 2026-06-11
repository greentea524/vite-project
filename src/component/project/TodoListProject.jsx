import { useEffect, useReducer, useState, useMemo, useCallback } from "react";
import "./todo.css";
import { NewTodoForm } from "./NewTodoForm";
import { TodoList } from "./TodoList";
import { TodoFilteredForm } from "./TodoFilteredForm";
import { TodoContext } from "./TodoContext";

const LOCAL_STORAGE_KEY = "TODOS";
const ACTIONS = {
  ADD: "ADD",
  UPDATE: "UPDATE",
  TOGGLE: "TOGGLE",
  DELETE: "DELETE",
};
function reducer(todos, { type, payload }) {
  switch (type) {
    case ACTIONS.ADD:
      return [
        ...todos,
        { name: payload.name, completed: false, id: crypto.randomUUID() },
      ];
    case ACTIONS.TOGGLE:
      return todos.map((todo) => {
        if (todo.id === payload.id)
          return { ...todo, completed: payload.completed };

        return todo;
      });
    case ACTIONS.DELETE:
      return todos.filter((todo) => todo.id !== payload.id);
    case ACTIONS.UPDATE:
      return todos.map((todo) => {
        if (todo.id === payload.id) {
          return { ...todo, name: payload.name };
        }
        return todo;
      });
    default:
      throw new Error(`No action found for ${type}.`);
  }
  return state;
}

function TodoListProject() {
  const [filterName, setFilterName] = useState("");
  const [hideCompletedFilter, setHideCompletedFilter] = useState("");
  const [todos, dispatch] = useReducer(reducer, [], (initialValue) => {
    const value = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (value == null) return initialValue;
    return JSON.parse(value);
  });
  const filteredTodos = todos.filter((todo) => {
    if (hideCompletedFilter && todo.completed) return false;
    return todo.name.includes(filterName);
  });
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const addNewTodo = useCallback((name) => {
    dispatch({ type: ACTIONS.ADD, payload: { name } });
  }, []);

  const toggleTodo = useCallback((todoId, completed) => {
    dispatch({ type: ACTIONS.TOGGLE, payload: { id: todoId, completed } });
  }, []);

  const deleteTodo = useCallback((todoId) => {
    dispatch({ type: ACTIONS.DELETE, payload: { id: todoId } });
  }, []);

  const updateTodoName = useCallback((id, name) => {
    dispatch({ type: ACTIONS.UPDATE, payload: { id, name } });
  }, []);

  const contextValue = useMemo(
    () => ({
      todos: filteredTodos,
      addNewTodo,
      toggleTodo,
      deleteTodo,
      updateTodoName,
    }),
    [filteredTodos, addNewTodo, toggleTodo, deleteTodo, updateTodoName],
  );

  return (
    <TodoContext.Provider value={contextValue}>
      <TodoFilteredForm
        name={filterName}
        setName={setFilterName}
        hideCompleted={hideCompletedFilter}
        setHideCompleted={setHideCompletedFilter}
      />
      <NewTodoForm />
      <TodoList />
    </TodoContext.Provider>
  );
}

export default TodoListProject;
