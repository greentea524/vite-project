export function UserCard({ name, company, phone, username }) {
  return (
    <div className="card">
      <h2 className="name">{name}</h2>
      <div className="body">
        <div className="label">Company:</div>
        <div>{company}</div>
        <div className="label">Phone:</div>
        <div>{phone}</div>
        <div className="label">Username:</div>
        <div>{username}</div>
      </div>
    </div>
  );
}

// function userList() {
//   const [isLoading, setIsLoading] = useState(true)
//   const [users, setUsers] = useState([])

//   useEffect(() => {
//     setIsLoading(true)

//     const controller = new AbortController()
//     fetch("https://jsonplaceholder.typicode.com/users", {
//       signal: controller.signal,
//     })
//       .then(res => res.json())
//       .then(setUsers)
//       .finally(() => {
//         setIsLoading(false)
//       })

//     return () => {
//       controller.abort()
//     }
//   }, [])

//   return (
//     <>
//       <h1>User List</h1>
//       {isLoading ? (
//         <h2>Loading...</h2>
//       ) : (
//         <ul>
//           {users.map(user => {
//             return <User key={user.id} name={user.name} />
//           })}
//         </ul>
//       )}
//     </>
//   )
// }
