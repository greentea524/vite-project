const PlayData = (function () {
  var acc = document.getElementsByClassName("accordion");
  var i;

  for (i = 0; i < acc.length; i++) {
    acc[i].addEventListener("click", function () {
      /* Toggle between adding and removing the "active" class,
        to highlight the button that controls the panel */
      this.classList.toggle("active");

      /* Toggle between hiding and showing the active panel */
      var panel = this.nextElementSibling;
      if (panel.style.display === "block") {
        panel.style.display = "none";
      } else {
        panel.style.display = "block";
      }
    });
  }

  function jsonPlaceHolder() {
    displayDataTableUser();
    displayDataTablePost();
  }

  return {
    jsonPlaceHolder: jsonPlaceHolder,
  };
})();

PlayData.jsonPlaceHolder();
//PlayData.fetchMockend();

export function displayDataTableUser() {
  if ($.fn.dataTable.isDataTable("#myTableOne")) {
    return;
  }
  $("#myTableOne").DataTable({
    ajax: {
      url: "https://jsonplaceholder.typicode.com/users",
      type: "GET",
      dataSrc: "",
    },
    columns: [
      { data: "id" },
      { data: "name" },
      { data: "username" },
      { data: "email", visible: false },
      { data: "website", visible: false },
    ],
    responsive: true,
    dom: "Bfrtip",
    buttons: [
      {
        extend: "colvis",
        collectionLayout: "fixed columns",
        collectionTitle: "Column visibility control",
        postfixButtons: ["colvisRestore"],
      },
      {
        extend: "pdfHtml5",
        download: "open",
      },
    ],
  });

  // fetch('https://jsonplaceholder.typicode.com/todos/1')
  // .then(response => response.json())
  // .then(json => console.log(json))
}

export function displayDataTablePost() {
  if ($.fn.dataTable.isDataTable("#myTableTwo")) {
    return;
  }
  $("#myTableTwo").DataTable({
    ajax: {
      url: "https://jsonplaceholder.typicode.com/posts",
      type: "GET",
      dataSrc: "",
    },
    columns: [
      { data: "userId" },
      { data: "id" },
      { data: "title" },
      { data: "body", visible: false },
    ],
    responsive: true,
    dom: "Bfrtip",
    buttons: [
      {
        extend: "colvis",
        collectionLayout: "fixed columns",
        collectionTitle: "Column visibility control",
        postfixButtons: ["colvisRestore"],
      },
      {
        extend: "pdfHtml5",
        download: "open",
      },
    ],
  });

  //   // fetch('https://mockend.com/greentea524/greentea524.github.io/posts')
  //   // .then(response => response.json())
  //   // .then(json => {
  //   //     console.log(json)
  //   //     //displayDataTablePost(json);
  //   // })
  //   //
  //   // fetch('https://mockend.com/greentea524/greentea524.github.io/users/1')
  //   // .then(response => response.json())
  //   // .then(json => {
  //   //     console.log(json)
  //   // })
}
