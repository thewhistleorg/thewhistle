/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* JavaScript library functions for reports-view.html page showing individual report details      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

/* global $ */
/* exported setReportId, setGroups, setupMetadataAutosubmitListeners, setupTagsListeners, setupCommentaryListeners, setupLocationListeners, initialiseMap, resizeElementHeight */


let reportId = '';
let selectedGroups = [];


$(document).ready(function() {
    setupGroupSelect();
    adjustScreen();
    $(window).resize(adjustScreen);
});


function adjustScreen() {
    if ($(window).width() < 1080) {
        $('.pure-u-2-5').hide();
        $('.pure-u-3-5').css('width', '100%');
    } else {
        $('.pure-u-2-5').show();
        $('.pure-u-3-5').css('width', '60%');
    }
}


function setReportId(id) {
    reportId = id;
}


function setGroups(groups) {
    selectedGroups = groups.split(',');
    $('#groupSelect').val(selectedGroups);
}


function setupGroupSelect() {
    $('#groupSelect').select2({
        placeholder: 'Select groups',
    });
    $('#groupSelect').on('select2:select', selectGroup);
    $('#groupSelect').on('select2:unselect', removeGroup);
}


/**
 * Set up listeners for metadata fields (summary, assigned-to, status, archived).
 */
function setupMetadataAutosubmitListeners() {
    // disabling summary for this release
    // document.querySelector('#summary').onchange = function submitSummary() {
    //     this.form.submit();
    // };
    document.querySelector('#assigned-to').onchange = function submitAssignedTo() {
        this.form.submit();
    };
    document.querySelector('#status').onchange = function submitStatus() {
        // TODO: trigger interactive validation? pattern="(?!\*)" seems to prevent datalist...
        this.form.submit();
    };
    document.querySelectorAll('[name=archived]').forEach(el => el.onchange = function submitArchived() {
        this.form.submit();
    });

}


/**
 * Set up listeners for adding / saving / cancelling / deleting tags.
 *
 */
function setupTagsListeners() {
    document.querySelector('#tag-add').onclick = openTagInputs;
    document.querySelector('#tag-save').onclick = saveTag;
    document.querySelector('#tag-cancel').onclick = cancelTagEntry;
    document.querySelectorAll('.tag-del').forEach(el => el.onclick = deleteTag);
    window.onkeydown = function(event) {
        if (event.key == 'Escape') cancelTagEntry();
    };

    document.querySelectorAll('span.tag').forEach(span => span.onmouseenter = function showDeleteButton() {
        this.querySelector('button').classList.remove('hide');
    });
    document.querySelectorAll('span.tag').forEach(span => span.onmouseleave = function hideDeleteButton() {
        this.querySelector('button').classList.add('hide');
    });

    function openTagInputs() {
        document.querySelector('#tag-add').classList.add('hide');
        document.querySelector('#new-tag').classList.remove('hide');
        document.querySelector('#tag').focus();
    }

    async function saveTag() {
        const newTagDiv = document.querySelector('#new-tag');
        const tag = newTagDiv.querySelector('#tag').value.toLowerCase();
        if (tag == '') {
            document.querySelector('#tag-add').classList.remove('hide');
            document.querySelector('#new-tag').classList.add('hide');
            return;
        }

        const values = JSON.stringify({ tag: tag });
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const credentials = 'same-origin';

        const response = await fetch(`/ajax/reports/${reportId}/tags`, { method: 'POST', body: values, headers, credentials });

        const body = await response.json();

        if (response.ok) {
            // create new tag span
            const tagDelBtn = '<button title="remove tag" class="tag-del hide fa fa-trash red"></button>';
            const newTag = document.createElement('span');
            newTag.classList.add('tag');
            newTag.innerHTML = `${tag} ${tagDelBtn}`;
            newTag.onmouseenter = function() { this.querySelector('button').classList.remove('hide'); };
            newTag.onmouseleave = function() { this.querySelector('button').classList.add('hide'); };
            newTag.querySelector('button').onclick = deleteTag;
            // and add it into document before 'add-tag' button
            const addTagBtn = document.querySelector('#tag-add');
            addTagBtn.parentNode.insertBefore(newTag, addTagBtn);
            newTagDiv.querySelector('#tag').value = ''; // reset input
            document.querySelector('#tag-add').classList.remove('hide');
            document.querySelector('#new-tag').classList.add('hide');
        } else {
            alert(response.status+': '+body.message);
        }
    }

    async function deleteTag() {
        const tagSpan = this.closest('span');
        const tag = encodeURIComponent(tagSpan.textContent.replace(/ $/, ''));
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const credentials = 'same-origin';

        const response = await fetch(`/ajax/reports/${reportId}/tags/${tag}`, { method: 'DELETE', headers, credentials });

        const body = await response.json();

        if (response.ok) {
            tagSpan.remove();
        } else {
            alert(body.message);
        }
    }

    function cancelTagEntry() {
        document.querySelector('#tag').value = '';
        document.querySelector('#new-tag').classList.add('hide');
        document.querySelector('#tag-add').classList.remove('hide');
    }
}


/**
 * Set up listeners for adding / editing / deleting notes (comments).
 *
 * @param {string}   username - name of user making changes.
 * @param {ObjectId} userid - id of user making changes.
 */
function setupCommentaryListeners(username, userid) {

    document.querySelector('#add-comment').onclick = postComment;
    document.querySelectorAll('div.by button.edit').forEach(btn => btn.onclick = editComment);
    document.querySelectorAll('div.by button.delete').forEach(btn => btn.onclick = confirmDeleteComment);
    document.querySelector('button#cancel-comment').onclick = editCommentCancel;
    document.querySelector('button#update-comment').onclick = editCommentUpdate;

    async function postComment() {
        const comment = document.querySelector('#comment').value;
        const values = JSON.stringify({ comment, username, userid });

        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const credentials = 'same-origin';

        const response = await fetch(`/ajax/reports/${reportId}/comments`, { method: 'POST', body: values, headers, credentials });

        const body = await response.json();

        if (response.ok) {
            const div = document.querySelector('#div-add-comment');
            const html = `<div class="comment" id="${body.id}">
                             <div class="by"><b><a href="/users/${username}">${username}</a></b> commented <a href="#${body.id}">${body.onPretty}</a>
                               <button class="float-right fa fa-times delete"></button>
                               <button class="float-right fa fa-pencil edit"></button>
                             </div>
                             <div>${body.comment}</div>
                           </div>`;
            div.insertAdjacentHTML('beforebegin', html);
            document.querySelectorAll('div.by button.delete').forEach(btn => btn.onclick = confirmDeleteComment);
            div.querySelector('#comment').value = '';
        } else {
            alert(response.status+': ' + body.message);
        }
    }

    function editComment() {
        const commentContainerDiv = this.closest('div.comment-container');
        const editCommentDiv = document.querySelector('#div-edit-comment');
        commentContainerDiv.querySelectorAll('div').forEach(div => div.classList.add('hide'));
        commentContainerDiv.insertAdjacentElement('beforeend', editCommentDiv);
        editCommentDiv.classList.remove('hide');
        editCommentDiv.querySelector('textarea').textContent = commentContainerDiv.querySelector('p').textContent;
        editCommentDiv.querySelector('textarea').focus();
        document.querySelector('#div-add-comment').classList.add('hide');
    }

    function editCommentCancel() {
        const commentContainerDiv = this.closest('div.comment-container');
        commentContainerDiv.querySelectorAll('div').forEach(div => div.classList.remove('hide'));
        document.querySelector('#div-edit-comment').classList.add('hide');
        document.querySelector('#div-add-comment').classList.remove('hide');
    }

    async function editCommentUpdate() {
        const commentContainerDiv = this.closest('div.comment-container');

        const comment = document.querySelector('#comment-edit').value;
        const values = JSON.stringify({ comment });

        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const credentials = 'same-origin';
        const url = `/ajax/reports/${reportId}/comments/${commentContainerDiv.id}`;

        const response = await fetch(url, { method: 'PUT', body: values, headers, credentials });

        const body = await response.json();

        if (response.ok) {
            commentContainerDiv.querySelector('p').textContent = body.comment;
            commentContainerDiv.querySelectorAll('div').forEach(div => div.classList.remove('hide'));
            document.querySelector('#div-edit-comment').classList.add('hide');
            document.querySelector('#div-add-comment').classList.remove('hide');
        } else {
            alert(response.status+': ' + body.message);
        }
    }

    async function confirmDeleteComment() {
        if (confirm('Are you sure you want to delete this comment?')) {
            const commentDiv = this.closest('.comment');

            const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
            const credentials = 'same-origin';

            const response = await fetch(`/ajax/reports/${reportId}/comments/${commentDiv.id}`, { method: 'DELETE', headers, credentials });

            if (response.ok) {
                commentDiv.remove();
            } else {
                const body = await response.text();
                alert(response.status+': '+body);
            }
        }
    }

}


function selectGroup(e) {
    const request = new XMLHttpRequest();
    const groupId = e.params.data.id;
    request.open('POST', `/add-group-to-report/${reportId}/${groupId}`);
    request.onreadystatechange = function() {
        if (request.readyState == 4) {
            if (request.status == 200) {
                selectedGroups.push(groupId);
            } else {
                //If POST didn't succeed
                $('#groupSelect').val(selectedGroups);
                alert('Error: Could not add group.');
            }
        }
    };
    request.send();
}


function removeGroup(e) {
    const request = new XMLHttpRequest();
    const groupId = e.params.data.id;
    request.open('POST', `/remove-group-from-report/${reportId}/${groupId}`);
    request.onreadystatechange = function() {
        if (request.readyState == 4) {
            if (request.status == 200) {
                const groupIndex = selectedGroups.indexOf('groupId');
                if (groupIndex != -1) {
                    selectedGroups.splice(groupIndex, 1);
                }
            } else {
                //If POST didn't succeed
                $('#groupSelect').val(selectedGroups);
                alert('Error: Could not remove group.');
            }
        }
    };
    request.send();
}


function setupLocationListeners() {
    document.querySelector('#location-edit').onclick = editLocation;
    document.querySelector('#location-cancel').onclick = cancelLocation;
    document.querySelector('#location-update').onclick = updateLocation;
    document.querySelector('#address').oninput = checkGeocoding;

    function editLocation() {
        document.querySelector('#location-edit').classList.add('hide');
        document.querySelector('#address').classList.remove('hide');
        document.querySelector('#location-cancel').classList.remove('hide');
        document.querySelector('#location-update').classList.remove('hide');
        document.querySelector('#location-update').disabled = true;
        document.querySelector('#location-update').style.color = '#999999';
        document.querySelector('#address').select();
    }

    function cancelLocation() {
        document.querySelector('#location-edit').classList.remove('hide');
        document.querySelector('#address').classList.add('hide');
        document.querySelector('#location-cancel').classList.add('hide');
        document.querySelector('#location-update').classList.add('hide');
        document.querySelector('#location-update').style.color = '#006600';
    }

    async function updateLocation() {
        const input = document.querySelector('#address');
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const credentials = 'same-origin';
        const url = `/ajax/reports/${reportId}/location`;
        const values = JSON.stringify({ address: input.value });

        const response = await fetch(url, { method: 'PUT', body: values, headers, credentials });

        if (response.ok) {
            window.location.reload();
        } else {
            // ???? - should never happen!
        }
    }

    function checkGeocoding() {
        delay(async function() {
            const input = document.querySelector('#address');
            const credentials = 'same-origin';
            const url = '/ajax/geocode';
            const addr = encodeURI(input.value).replace(/%20/g, '+');

            const response = await fetch(`${url}?address=${addr}`, { credentials });

            switch (response.status) {
                case 200:
                    const body = await response.json();
                    document.querySelector('#location-update').disabled = false;
                    document.querySelector('#location-update').style.color = '#006600';
                    document.querySelector('#location-update').title = body.formattedAddress;
                    break;
                case 404:
                    document.querySelector('#location-update').disabled = true;
                    document.querySelector('#location-update').style.color = '#999999';
                    break;
            }
        }, 330);
    }

    const delay = (function() {
        let timer = null;
        return function(callback, ms) {
            clearTimeout (timer);
            timer = setTimeout(callback, ms);
        };
    })();
}


/**
 * Initialise Google map, and set up listeners for zoom & pan, and add new report markers as map is
 * zoomed / panned.
 *
 * @param {Object}   google - Google Map object returned by maps.googleapis.com/maps/api/js
 * @param {string}   alias - anonymous identifier name of reporter
 * @param {number}   lat - latitude of incident
 * @param {number}   lon - longitude of incident
 * @param {string}   reportedOnDay - TODO: is this used?
 * @param {number}   highlight - opacity of marker, to indicate how long ago incident was reported
 */
function initialiseMap(google, alias, lat, lon, reportedOnDay, highlight) {
    // initialise array of reports markers with 'this' report
    const reports = {
        [reportId]: { lat: lat, lng: lon, date: reportedOnDay, highlight: highlight, name: alias },
    };

    const mapStyles = [
        { featureType: 'all',                         elementType: 'geometry',           stylers: [ { visibility: 'simplified' }, { hue: '#ff7700' } ] },
        { featureType: 'administrative',              elementType: 'all',                stylers: [ { visibility: 'simplified' } ] },
        { featureType: 'administrative.country',      elementType: 'labels.text.fill',   stylers: [ { color: '#1d1d1d' } ] },
        { featureType: 'administrative.province',     elementType: 'labels.text.fill',   stylers: [ { visibility: 'on' }, { color: '#ffffff' } ] },
        { featureType: 'administrative.province',     elementType: 'labels.text.stroke', stylers: [ { visibility: 'on' }, { color: '#ff5f00' }, {  weight: '5.00' } ] },
        { featureType: 'administrative.locality',     elementType: 'labels.text.fill',   stylers: [ { visibility: 'on' }, { color: '#787878' } ] },
        { featureType: 'administrative.locality',     elementType: 'labels.text.stroke', stylers: [ { visibility: 'on' }, { color: '#ffffff' }, { weight: '5.00'  } ]  },
        { featureType: 'administrative.neighborhood', elementType: 'labels.text',        stylers: [ { visibility: 'on' } ] },
        { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill',   stylers: [ { visibility: 'on' }, { color: '#2d2d2d' } ] },
        { featureType: 'administrative.neighborhood', elementType: 'labels.text.stroke', stylers: [ { visibility: 'on' }, { color: '#ffffff' }, { weight: '5.00' } ] },
        { featureType: 'administrative.land_parcel',  elementType: 'geometry.fill',      stylers: [ { saturation: '64' } ] },
        { featureType: 'landscape',                   elementType: 'geometry',           stylers: [ { color: '#fafafa' } ] },
        { featureType: 'poi',                         elementType: 'all',                stylers: [ { visibility: 'off' } ] },
        { featureType: 'road',                        elementType: 'geometry',           stylers: [ { color: '#2c2c2c' } ] },
        { featureType: 'road',                        elementType: 'geometry.fill',      stylers: [ { visibility: 'on' }, { color: '#d5d5d5' } ] },
        { featureType: 'road',                        elementType: 'geometry.stroke',    stylers: [ { visibility: 'off' } ] },
        { featureType: 'road',                        elementType: 'labels',             stylers: [ { visibility: 'on' }, { color: '#ff0000' } ] },
        { featureType: 'road',                        elementType: 'labels.text.fill',   stylers: [ { color: '#033549' } ] },
        { featureType: 'road',                        elementType: 'labels.text.stroke', stylers: [ { visibility: 'on' }, { color: '#ffffff' }, { weight: '5.00' } ] },
        { featureType: 'road',                        elementType: 'labels.icon',        stylers: [ { visibility: 'off' } ] },
        { featureType: 'road.highway',                elementType: 'geometry.fill',      stylers: [ { visibility: 'on' }, { color: '#d1dee3' }, { lightness: '55' } ] },
        { featureType: 'road.highway',                elementType: 'geometry.stroke',    stylers: [ { visibility: 'on' }, { color: '#033549' }, { lightness: '100' }, {  saturation: '-100' } ] },
        { featureType: 'road.highway',                elementType: 'labels.text',        stylers: [ { color: '#ffffff' } ] },
        { featureType: 'road.highway',                elementType: 'labels.text.fill',   stylers: [ { color: '#ffffff' } ] },
        { featureType: 'road.highway',                elementType: 'labels.text.stroke', stylers: [ { visibility: 'on' }, { color: '#b2b2b2' }, { lightness: '-1' }, { saturation: '13' } ] },
        { featureType: 'road.arterial',               elementType: 'geometry.stroke',    stylers: [ { visibility: 'on' }, { color: '#ff5f00' } ] },
        { featureType: 'transit.station',             elementType: 'labels.icon',        stylers: [ { visibility: 'off' } ] },
        { featureType: 'transit.station.airport',     elementType: 'geometry.fill',      stylers: [ { visibility: 'simplified' }, { lightness: '4' }, { saturation: '-100' } ] },
        { featureType: 'water',                       elementType: 'all',                stylers: [ { visibility: 'off' } ] },
        { featureType: 'water',                       elementType: 'geometry.fill',      stylers: [ { visibility: 'on' }, { color: '#d1dee3' } ] },
    ];

    const map = new google.maps.Map(document.getElementById('map'), {
        zoom:        14,
        center:      { lat: lat, lng: lon },
        scrollwheel: false,
        styles:      mapStyles,
    });

    // add marker for 'this' report
    map.greatestExtent = new google.maps.LatLngBounds(map.getCenter(), map.getCenter());
    const markerThis = new google.maps.Marker({
        position:  { lat: lat, lng: lon },
        icon:      `/map-marker/red/${highlight}`,
        zIndex:    google.maps.Marker.MAX_ZINDEX+1, // ensure this report on top on top if superposed
        draggable: true,
        map:       map,
    });
    // and allow marker to be repositioned
    markerThis.addListener('dragend', async function(evt) {
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const credentials = 'same-origin';
        const url = `/ajax/reports/${reportId}/latlon`;
        const values = JSON.stringify({ lat: evt.latLng.lat(), lon: evt.latLng.lng() });

        const response = await fetch(url, { method: 'PUT', body: values, headers, credentials });
        if (!response.ok) alert('Location update failed');

        map.panTo(new google.maps.LatLng(evt.latLng.lat(), evt.latLng.lng()));
    });

    // after zoom/pan, check for any new reports not currently displayed on the map
    google.maps.event.addListener(map, 'idle', async function() {
        // no need to fetch new reports if we haven't extended bounds beyond previous extent
        const bounds = new google.maps.LatLngBounds(map.greatestExtent.getSouthWest(), map.greatestExtent.getNorthEast());
        const newBounds = map.getBounds();
        const sw = newBounds.getSouthWest();
        const ne = newBounds.getNorthEast();
        bounds.extend(sw).extend(ne);
        if (bounds.equals(map.greatestExtent)) return; // still within previously checked bounds
        map.greatestExtent = bounds;

        // fetch all reports within new bounds
        try {
            const headers = { Accept: 'application/json' };
            const credentials = 'same-origin';
            const url = `/ajax/reports/within/${sw.lat()},${sw.lng()}:${ne.lat()},${ne.lng()}`;

            const response = await fetch(url, { method: 'GET', headers, credentials });

            const body = await response.json();
            if (response.ok) {
                for (const report of body.reports) {
                    if (reports[report._id] == undefined) { // if we haven't already got marker for this report, add it
                        reports[report._id] = report;
                        const marker = new google.maps.Marker({
                            position: { lat: report.lat, lng: report.lng },
                            icon:     '/map-marker/blue/'+report.highlight,
                            label:    { text: `${report.alias} ${report.reported}`, color: '#004466' },
                            url:      '/reports/'+report._id,
                            map:      map,
                        });
                        let info = report.assignedToText;
                        if (report.status) info += `<div>Status: ${report.status}</div>`;
                        if (report.tags.length > 0) info += `<div>Tags: ${report.tags.join('; ')}</div>`;
                        const infowindow = new google.maps.InfoWindow({ content: info });
                        marker.addListener('mouseover', function() {
                            infowindow.open(map, marker);
                        });
                        marker.addListener('mouseout', function() {
                            infowindow.close(map, marker);
                        });
                        marker.addListener('click', function() {
                            window.location.href = marker.url;
                        });
                    }
                }
            } else {
                alert(body.message); // TODO: display in HTML?
            }
        } catch (e) {
            alert(e.message);
        }
    });
}


/**
 * Set height of a container
 *
 * @param {ObjectId} element
 */
function resizeElementHeight(element) {
    let height = 0;
    const body = window.document.body;
    if (window.innerHeight) {
        height = window.innerHeight;
    } else if (body.parentElement.clientHeight) {
        height = body.parentElement.clientHeight;
    } else if (body && body.clientHeight) {
        height = body.clientHeight;
    }
    element.style.height = ((height - element.offsetTop) + 'px');
}
