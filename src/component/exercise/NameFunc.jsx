export function NameFunc({ name, age = 35, isProgrammer }) {
  //console.log("is programmer", isProgrammer);
  return (
    <div>
      {name} {age}
    </div>
  );
}
// destructing props from props.name, props.age
