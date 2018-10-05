'use strict';

let currentDb = '';

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('roles-leader').addEventListener('change', manageGroupsVisibility);
    document.getElementById('roles-su').addEventListener('change', manageGroupsVisibility);
    document.getElementById(`databases-${currentDb}`).addEventListener('change', manageGroupsVisibility);
});


function setCurrentDb(db) { // eslint-disable-line no-unused-vars
    currentDb = db;
}

function checkGroups(groups) { // eslint-disable-line no-unused-vars
    const groupsArray = groups.split(',');
    for (let i = 0; i < groupsArray.length; i++) {
        const groupCheckbox = document.getElementById(`groups-${groupsArray[i]}`);
        groupCheckbox.checked = true;
    }
}


function manageGroupsVisibility() {
    const leader = document.getElementById('roles-leader');
    const su = document.getElementById('roles-su');
    const db = document.getElementById(`databases-${currentDb}`);
    if (leader.checked && !su.checked && db.checked) {
        showGroups();
    } else {
        hideGroups();
    }
}


function showGroups() {
    const groupList = document.getElementById('group-list');
    groupList.classList.remove('hide');   
}

function hideGroups() {
    const groupList = document.getElementById('group-list');
    groupList.classList.add('hide');
}
