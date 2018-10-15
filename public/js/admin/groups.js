'use strict';


document.addEventListener('DOMContentLoaded', function() {
    const deleteBtns = document.getElementsByClassName('group-delete-btn');
    for (let i = 0; i < deleteBtns.length; i++) {
        deleteBtns[i].addEventListener('click', deleteGroupListener);
    }
});


function deleteGroupListener() {
    const groupName = this.parentNode.firstElementChild.innerHTML;
    const confirmDelete = confirm(`Are you sure you want to delete group ${groupName}?`);
    if (confirmDelete) {
        deleteGroup(this.id.substr(7));
    }
}


function deleteGroup(groupId) {
    const request = new XMLHttpRequest();
    request.open('POST', `/delete-group/${groupId}`);
    request.onreadystatechange = function() {
        if (request.readyState == 4) {
            if (request.status == 200) {
                //When the POST request receives a response
                window.location.href = '/groups';
            } else {
                alert('Error: Could not delete group.');
            }
        }
    };
    request.send();
}
