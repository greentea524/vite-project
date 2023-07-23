export function TodoFilteredForm({
  name,
  setName,
  hideCompleted,
  setHideCompleted,
}) {
  return (
    <div className="filter-form">
      <div className="filter-form-group">
        <label htmlFor="name">Todo Search </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        ></input>
      </div>
      <label>
        <input
          type="checkbox"
          checked={hideCompleted}
          onChange={(e) => setHideCompleted(e.target.checked)}
        ></input>{" "}
        Hide Completed
      </label>
    </div>
  );
}
