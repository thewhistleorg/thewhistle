/* JavaScript for page showing individual report details */

'use strict';


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
 * @param {ObjectId} reportId - id of report being updated.
 */
function setupTagsListeners(reportId) {
    document.querySelector('#tag-add').onclick = openTagInputs;
    document.querySelector('#tag-save').onclick = saveTag;
    document.querySelector('#tag-cancel').onclick = cancelTagEntry;
    document.querySelectorAll('.tag-del').forEach(el => el.onclick = deleteTag);
    window.onkeydown = function(event) {
        if (event.key == 'Escape') cancelTagEntry()
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

    function cancelTagEntry(event) {
        document.querySelector('#tag').value = '';
        document.querySelector('#new-tag').classList.add('hide');
        document.querySelector('#tag-add').classList.remove('hide');
    }
}


/**
 * Set up listeners for adding / editing / deleting notes (comments).
 *
 * @param {ObjectId} reportId - id of report being updated.
 * @param {string}   username - name of user making changes.
 * @param {ObjectId} userid - id of user making changes.
 */
function setupCommentaryListeners(reportId, username, userid) {
    const credentials = 'same-origin';

    document.querySelector('#add-comment').onclick = postComment;
    document.querySelectorAll('div.by button.edit').forEach(btn => btn.onclick = editComment);
    document.querySelectorAll('div.by button.delete').forEach(btn => btn.onclick = confirmDeleteComment);

    async function postComment() {
        const comment = document.querySelector('#comment').value;
        const values = JSON.stringify({ comment, username,userid });

        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const response = await fetch(`/ajax/reports/${reportId}/comments`, { method: 'POST', body: values, headers, credentials });
        const body = await response.json();

        if (response.ok) {
            const div = document.querySelector('#div-add-comment');
            const html = `<div class="comment" id="${body.id}">
                             <div class="by"><b><a href="/users/${username}">${username}</a></b> commented <a href="#${body.id}">${body.onPretty}</a>
                               <button class="float-right fa fa-times delete"></button>
                               <button class="float-right fa fa-pencil edit">
                             </div>
                             <div>${body.comment}</div>
                           </div>`;
            div.insertAdjacentHTML('beforebegin', html);
            document.querySelectorAll('div.by button.delete').forEach(btn => btn.onclick = confirmDelete);
            div.querySelector('#comment').value = '';
        } else {
            alert(response.status+': ' + body.message);
        }
    }

    async function editComment() {
        alert('Comment edit function TBC');
    }

    async function confirmDeleteComment() {
        if (confirm('Are you sure you want to delete this comment?')) {
            const commentDiv = this.closest('.comment');

            const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
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


/**
 * Initialise Google map, and set up listeners for zoom & pan, and add new report markers as map is
 * zoomed / panned.
 *
 * @param {ObjectId} reportId - id of report being shown.
 * @param {string}   reporter - anonymous identifier name of reporter
 * @param {number}   lat - latitude of incident
 * @param {number}   lon - longitude of incident
 * @param {string}   reportedOnDay - TODO: is this used?
 * @param {string}   reportedOnFull - date of incident submission, for icon title
 * @param {number}   highlight - opacity of marker, to indicate how long ago incident was reported
 */
function initialiseMap(reportId, reporter, lat, lon, reportedOnDay, reportedOnFull, highlight) {
    // initialise array of reports markers with 'this' report
    const reports = {
        [reportId]: { lat: lat, lng: lon, date: reportedOnDay, highlight: highlight, name: reporter },
    };

    const map = new google.maps.Map(document.getElementById('map'), {
        zoom:   14,
        center: { lat: lat, lng: lon },
        scrollwheel: false,
        styles:   [{
                      "featureType": "all",
                      "elementType": "geometry",
                      "stylers": [{
                              "visibility": "simplified"
                          },
                          {
                              "hue": "#ff7700"
                          }
                      ]
                  },
                  {
                      "featureType": "administrative",
                      "elementType": "all",
                      "stylers": [{
                          "visibility": "simplified"
                      }]
                  },
                  {
                      "featureType": "administrative.country",
                      "elementType": "labels.text.fill",
                      "stylers": [{
                          "color": "#1d1d1d"
                      }]
                  },
                  {
                      "featureType": "administrative.province",
                      "elementType": "labels.text.fill",
                      "stylers": [{
                              "color": "#ffffff"
                          },
                          {
                              "visibility": "on"
                          }
                      ]
                  },
                  {
                      "featureType": "administrative.province",
                      "elementType": "labels.text.stroke",
                      "stylers": [{
                              "color": "#ff5f00"
                          },
                          {
                              "weight": "5.00"
                          },
                          {
                              "visibility": "on"
                          }
                      ]
                  },
                  {
                      "featureType": "administrative.locality",
                      "elementType": "labels.text.fill",
                      "stylers": [{
                              "color": "#787878"
                          },
                          {
                              "visibility": "on"
                          }
                      ]
                  },
                  {
                      "featureType": "administrative.locality",
                      "elementType": "labels.text.stroke",
                      "stylers": [{
                              "color": "#ffffff"
                          },
                          {
                              "visibility": "on"
                          },
                          {
                              "weight": "5.00"
                          }
                      ]
                  },
                  {
                      "featureType": "administrative.neighborhood",
                      "elementType": "labels.text",
                      "stylers": [{
                          "visibility": "on"
                      }]
                  },
                  {
                      "featureType": "administrative.neighborhood",
                      "elementType": "labels.text.fill",
                      "stylers": [{
                              "visibility": "on"
                          },
                          {
                              "color": "#2d2d2d"
                          }
                      ]
                  },
                  {
                      "featureType": "administrative.neighborhood",
                      "elementType": "labels.text.stroke",
                      "stylers": [{
                              "color": "#ffffff"
                          },
                          {
                              "visibility": "on"
                          },
                          {
                              "weight": "5.00"
                          }
                      ]
                  },
                  {
                      "featureType": "administrative.land_parcel",
                      "elementType": "geometry.fill",
                      "stylers": [{
                          "saturation": "64"
                      }]
                  },
                  {
                      "featureType": "landscape",
                      "elementType": "geometry",
                      "stylers": [{
                          "color": "#fafafa"
                      }]
                  },
                  {
                      "featureType": "poi",
                      "elementType": "all",
                      "stylers": [{
                          "visibility": "off"
                      }]
                  },
                  {
                      "featureType": "road",
                      "elementType": "geometry",
                      "stylers": [{
                          "color": "#2c2c2c"
                      }]
                  },
                  {
                      "featureType": "road",
                      "elementType": "geometry.fill",
                      "stylers": [{
                              "visibility": "on"
                          },
                          {
                              "color": "#d5d5d5"
                          }
                      ]
                  },
                  {
                      "featureType": "road",
                      "elementType": "geometry.stroke",
                      "stylers": [{
                          "visibility": "off"
                      }]
                  },
                  {
                      "featureType": "road",
                      "elementType": "labels",
                      "stylers": [{
                              "visibility": "on"
                          },
                          {
                              "color": "#ff0000"
                          }
                      ]
                  },
                  {
                      "featureType": "road",
                      "elementType": "labels.text.fill",
                      "stylers": [{
                          "color": "#033549"
                      }]
                  },
                  {
                      "featureType": "road",
                      "elementType": "labels.text.stroke",
                      "stylers": [{
                              "visibility": "on"
                          },
                          {
                              "color": "#ffffff"
                          },
                          {
                              "weight": "5.00"
                          }
                      ]
                  },
                  {
                      "featureType": "road",
                      "elementType": "labels.icon",
                      "stylers": [{
                          "visibility": "off"
                      }]
                  },
                  {
                      "featureType": "road.highway",
                      "elementType": "geometry.fill",
                      "stylers": [{
                              "color": "#d1dee3"
                          },
                          {
                              "visibility": "on"
                          },
                          {
                              "lightness": "55"
                          }
                      ]
                  },
                  {
                      "featureType": "road.highway",
                      "elementType": "geometry.stroke",
                      "stylers": [{
                              "visibility": "on"
                          },
                          {
                              "lightness": "100"
                          },
                          {
                              "saturation": "-100"
                          },
                          {
                              "color": "#033549"
                          }
                      ]
                  },
                  {
                      "featureType": "road.highway",
                      "elementType": "labels.text",
                      "stylers": [{
                          "color": "#ffffff"
                      }]
                  },
                  {
                      "featureType": "road.highway",
                      "elementType": "labels.text.fill",
                      "stylers": [{
                          "color": "#ffffff"
                      }]
                  },
                  {
                      "featureType": "road.highway",
                      "elementType": "labels.text.stroke",
                      "stylers": [{
                              "visibility": "on"
                          },
                          {
                              "color": "#b2b2b2"
                          },
                          {
                              "saturation": "13"
                          },
                          {
                              "lightness": "-1"
                          }
                      ]
                  },
                  {
                      "featureType": "road.arterial",
                      "elementType": "geometry.stroke",
                      "stylers": [{
                              "color": "#ff5f00"
                          },
                          {
                              "visibility": "on"
                          }
                      ]
                  },
                  {
                      "featureType": "transit.station",
                      "elementType": "labels.icon",
                      "stylers": [{
                          "visibility": "off"
                      }]
                  },
                  {
                      "featureType": "transit.station.airport",
                      "elementType": "geometry.fill",
                      "stylers": [{
                              "visibility": "simplified"
                          },
                          {
                              "lightness": "4"
                          },
                          {
                              "saturation": "-100"
                          }
                      ]
                  },
                  {
                      "featureType": "water",
                      "elementType": "all",
                      "stylers": [{
                          "visibility": "off"
                      }]
                  },
                  {
                      "featureType": "water",
                      "elementType": "geometry.fill",
                      "stylers": [{
                              "color": "#d1dee3"
                          },
                          {
                              "visibility": "on"
                          }
                      ]
                  }
              ]
    });

    // add marker for 'this' report
    map.greatestExtent = new google.maps.LatLngBounds(map.getCenter(), map.getCenter());
    const marker = new google.maps.Marker({
        position: { lat: lat, lng: lon },
        icon:     `/map-marker/red/${highlight}`,
        label:    reporter,
        title:    reportedOnFull, // TODO: use info window for status, etc
        url:      `/reports/${reportId}`,
        map:      map
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
                            title:    report.reported + ' ' + report.name + ' ' + report.summary, // TODO: use info window for status, etc?
                            url:      '/reports/'+report._id+'/location',
                            map:      map,
                        });
                        google.maps.event.addListener(marker, 'click', function() {
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
  var height = 0;
  var body = window.document.body;
  if (window.innerHeight) {
      height = window.innerHeight;
  } else if (body.parentElement.clientHeight) {
      height = body.parentElement.clientHeight;
  } else if (body && body.clientHeight) {
      height = body.clientHeight;
  }
  element.style.height = ((height - element.offsetTop) + "px");
}
