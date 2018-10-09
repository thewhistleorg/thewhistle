/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* JavaScript for handling notifications                                                          */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* global Handlebars, Cookies */

'use strict';


const theWhistle = { // avoid polluting global namespace excessively!
    notifications: {
        lastUpdate: '0000-00-00', // most recent change to notifications (notify/dismiss)
        template:   '',           // handlebars template for pop-up notifications (set below)
    },
};

document.addEventListener('DOMContentLoaded', function() {
    // compile the handlebars template for the notifications
    const template = Handlebars.compile(theWhistle.notifications.template);

    // notifications are saved in a cookie so we don't need to fetch them from the server on each
    // page transition
    const ntfctnsCookie = Cookies.get('ntfctns');
    if (ntfctnsCookie) {
        const notificationsJson = JSON.parse(ntfctnsCookie);
        theWhistle.notifications.lastUpdate = notificationsJson.last;
        displayNotifications(notificationsJson);
    } else {
        // if nothing saved in cookie, check for notifications now without setInterval delay
        checkForNotifications(); // note without await
    }

    // check whether there have been any new notifications since the last one we fetched
    // this simply polls: since the request is quite light, this will scale quite a way, but
    // eventually it might be better to long-poll or even use push technology
    async function checkForNotifications() {
        const credentials = 'same-origin';
        try {
            const response = await fetch('/ajax/notifications/last-update', { credentials });
            if (!response.ok) { notifyFail('Notification latest-timestamp failed!'); return; }

            const lastNotification = await response.json();
            if (lastNotification.timestamp > theWhistle.notifications.lastUpdate) {
                await refreshNotifications();
                theWhistle.notifications.lastUpdate = lastNotification.timestamp;
            }
        } catch (e) {
            notifyFail('Notification latest-timestamp failed!');
        }
    }
    setInterval(checkForNotifications, 2e3); // every 2 seconds

    // set up listener to show notifications on hover over 'bell' badge
    document.querySelector('nav li.notifications').onmouseenter = function() {
        document.querySelector('#notifications').classList.remove('hide');
    };
    document.querySelector('nav li.notifications').onmouseleave = function() {
        document.querySelector('#notifications').classList.add('hide');
    };

    // fetch notifications from the server in order to update the drop-down list
    async function refreshNotifications() {
        const credentials = 'same-origin';
        try {
            const response = await fetch('/ajax/notifications', { credentials });
            if (!response.ok) { notifyFail('Notification refresh failed!'); return; }

            const notificationsJson = await response.json();
            displayNotifications(notificationsJson);

            // store in cookie so we don't need to hit server for details on each new page
            Cookies.set('ntfctns', notificationsJson);
        } catch (e) {
            notifyFail('Notification refresh failed!');
        }
    }

    // update the drop-down list with new notifications
    function displayNotifications(notificationsJson) {
        const nNotifications = notificationsJson.count;

        if (nNotifications == 0) {
            document.querySelector('nav .notifications').classList.add('hide');
        }
        if (nNotifications > 0) {
            const notifcns = document.querySelector('#notifications');
            if (notifcns) notifcns.remove();
            const notificationsHtml = template(notificationsJson);
            document.querySelector('nav .notifications .counter').textContent = nNotifications;
            document.querySelector('nav .notifications').insertAdjacentHTML('beforeend', notificationsHtml);
            document.querySelector('nav .notifications').classList.remove('hide');
            // and attach a function to dismiss notifications to each dismiss 'x'
            document.querySelectorAll('#notifications .dismiss').forEach(el => el.onclick = async function() {
                const notificationId = this.parentElement.id;
                const credentials = 'same-origin';
                try {
                    const response = await fetch(`/ajax/notifications/${notificationId}`, { method: 'DELETE', credentials });
                    if (!response.ok) { notifyFail('Notification refresh failed!'); return; }
                    await refreshNotifications();
                } catch (e) {
                    notifyFail('Notification refresh failed!');
                }
            });
        }
    }

    // signal that notification updates have failed
    function notifyFail(msg) {
        const notifcns = document.querySelector('#notifications');
        if (notifcns) notifcns.remove();
        document.querySelector('nav .notifications .counter').textContent = ' ! '; // note U+2005 ¼ em spaces
        const notificationsHtml = `<div id="notifications">${msg}</div>`;
        document.querySelector('nav .notifications').insertAdjacentHTML('beforeend', notificationsHtml);
        document.querySelector('nav .notifications').classList.remove('hide');
    }

});


theWhistle.notifications.template = `
<section id="notifications" class="hide drop-shadow">
    <table>
    {{#each events}}
        <tr>
            <td class="event" colspan="3">{{@key}}</td>
        </tr>
        {{#each this}}
        <tr id="{{this.nId}}">
            <td><div class="fa fa-circle new-indicator"></div></td>
            <td class="report" title="go to report"><a href="/reports/{{this.rId}}">{{this.alias}} ({{this.at}})</a><section id="notifications" class="hide"></section></td>
            <td class="dismiss" title="dismiss notification">✖</td>
        </tr>
        {{/each}}
    {{/each}}
    </table>
</section>`;
