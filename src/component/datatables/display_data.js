
const PlayData = function() {

    var acc = document.getElementsByClassName("accordion");
    var i;
    
    for (i = 0; i < acc.length; i++) {
      acc[i].addEventListener("click", function() {
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
    }

    function fetchMockend() {
        displayDataTablePost();
    }

	return {
		jsonPlaceHolder: jsonPlaceHolder,
		fetchMockend: fetchMockend
	}

}();

PlayData.jsonPlaceHolder();
PlayData.fetchMockend();

export function displayDataTableUser() {
    if ( $.fn.dataTable.isDataTable( '#myTableOne' ) ) {
        return;
    }
    $('#myTableOne').DataTable({
        ajax: {
            url: "https://jsonplaceholder.typicode.com/users",
            type: "GET",
            dataSrc: ""
        },
        columns: [
            { "data": "id" },
            { "data": "name" },
            { "data": "username" },
            { "data": "email" },
            { "data": "website" }
        ],
        responsive: true,
        dom: 'Bfrtip',
        buttons: [
            {
                extend: 'colvis',
                collectionLayout: 'fixed columns',
                collectionTitle: 'Column visibility control',
                postfixButtons: [ 'colvisRestore' ]
            },
            {
                extend: 'pdfHtml5',
                download: 'open'
            }

        ]
    });

    // fetch('https://jsonplaceholder.typicode.com/todos/1')
    // .then(response => response.json())
    // .then(json => console.log(json))
}

export function displayDataTablePost() {
    if ( $.fn.dataTable.isDataTable( '#myTableTwo' ) ) {
        return;
    }
    $('#myTableTwo').DataTable({
        ajax: {
            url: "https://mockend.com/greentea524/greentea524.github.io/posts",
            type: "GET",
            dataSrc: ""
        },
        columns: [
            { "data": "title" },
            { "data": "views" },
            { "data": "published" },
            { "data": "createdAt" }
        ],
        responsive: true,
        dom: 'Bfrtip',
        buttons: [
            {
                extend: 'colvis',
                collectionLayout: 'fixed columns',
                collectionTitle: 'Column visibility control',
                postfixButtons: [ 'colvisRestore' ]
            },
            {
                extend: 'pdfHtml5',
                download: 'open'
            }
        ]
    });

    // fetch('https://mockend.com/greentea524/greentea524.github.io/posts')
    // .then(response => response.json())
    // .then(json => {
    //     console.log(json)
    //     //displayDataTablePost(json);
    // })
    //
    // fetch('https://mockend.com/greentea524/greentea524.github.io/users/1')
    // .then(response => response.json())
    // .then(json => {
    //     console.log(json)
    // })

}
