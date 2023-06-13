export function TodoListItem({ children, isComplete }) {
  return (
    <div>
      <label>
        <input type="checkbox" checked={isComplete}></input>
        {children}
      </label>
    </div>
  );
}
