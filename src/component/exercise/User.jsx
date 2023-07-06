export function User({ name, age }) {
  return (
    <div>
      {name}: <span style={{ color: "red" }}>{age}</span>
    </div>
  );
}
