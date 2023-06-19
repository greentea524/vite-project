export function User({ name, age }) {
  return (
    <h1>
      {name}: <span style={{ color: "red" }}>{age}</span>
    </h1>
  );
}
