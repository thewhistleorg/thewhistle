/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Notifications handlers - ajax functions to support displaying notifications to user.           */
/*                                                                                 C.Veness 2018  */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Notification from '../models/notification.js';
import Report       from '../models/report.js';
import User         from '../models/user.js';
import log          from '../lib/log';
import dateFormat from 'dateformat';


class NotificationsHandlers {

    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

    /**
     * GET /ajax/notifications/last-update - Timestamp of most recent update to notifications
     */
    static async ajaxLastUpdate(ctx) {
        const db = ctx.state.user.db;

        try {
            const timestamp = await Notification.lastUpdate(db);
            ctx.status = 200; // Ok
            ctx.body = { timestamp: timestamp };
        } catch (e) {
            ctx.status = 500; // Internal Server Error
            ctx.body = e;
            await log(ctx, 'error', null, null, e);
        }
        ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        ctx.body.root = 'notifications';
    }


    /**
     * GET /ajax/notifications - List notifications for logged-on user
     */
    static async ajaxList(ctx) {
        const db = ctx.state.user.db;
        const userId = ctx.state.user.id;

        const events = await Notification.events(db);

        const notifications = {
            events: {},
            count:  0,
            last:   Notification.lastUpdate(db),
        };

        try {
            for (const event of events) {
                const eventNotifications = await Notification.listForUser(db, userId, event);
                if (eventNotifications.length == 0) continue;

                // replace reportId with report details & add datetime
                for (const notification of eventNotifications) {
                    // get alias from the report
                    const rpt = await Report.get(db, notification.report);
                    // and collect info to send back in response
                    notification.report = {
                        nId:   notification._id,
                        rId:   notification.report,
                        alias: rpt ? rpt.alias : '',
                        at:    prettyDate(notification._id.getTimestamp()),
                    };
                }

                notifications.events[event] = eventNotifications.map(notificn => notificn.report);
                notifications.count += notifications.events[event].length;
            }
            ctx.status = 200; // Ok
            ctx.body = notifications;
        } catch (e) {
            ctx.status = 500; // Internal Server Error
            ctx.body = e;
            await log(ctx, 'error', null, null, e);
        }
        ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        ctx.body.root = 'notifications';
    }


    /**
     * DELETE /ajax/notifications/:notification/:user - Dismiss notification
     */
    static async ajaxDismiss(ctx) {
        const db = ctx.state.user.db;
        const notificationId = ctx.params.notification;
        const userId = ctx.state.user.id;

        try {
            await Notification.dismiss(db, notificationId, userId);
            ctx.status = 200;
            ctx.body = {};
        } catch (e) {
            ctx.status = 500; // Internal Server Error
            ctx.body = e;
            await log(ctx, 'error', null, null, e);
        }
        ctx.body.root = 'notifications';
    }


    /**
     * GET /ajax/notifications/debug - List all notifications, for debugging
     *
     * Note this returns texgt/plain, not application/json, for legible response: to treat as JS
     * object, use JSON.parse(response.text).
     */
    static async ajaxListDebug(ctx) {
        const db = ctx.state.user.db;

        const usrs = await User.getForDb(db);
        const users = Object.assign({}, ...usrs.map(u => ({ [u._id]: u }))); // as assoc. array

        try {
            const notifications = await Notification.listDebug(db);

            for (const notifcn of notifications) {
                for (let u=0; u<notifcn.users.length; u++) {
                    notifcn.users[u] = {
                        id:   notifcn.users[u],
                        name: users[notifcn.users[u]].username,
                    };
                }
                notifcn.timestamp = notifcn._id.getTimestamp();
            }
            ctx.status = 200;
            ctx.body = JSON.stringify(notifications, null, 2);
        } catch (e) {
            ctx.status = 500; // Internal Server Error
            ctx.body = e;
            await log(ctx, 'error', null, null, e);
        }
        // ctx.body.root = 'notifications';
    }

}


/**
 * Format supplied date showing just time if it is today, day of week if within past week, otherwise
 * 'd mmm' format.
 *
 * @param {Date} date - Date to be formatted.
 * @returns {string} Formatted date.
 */
function prettyDate(date) {
    // today
    if (new Date(date).toDateString() == new Date().toDateString()) {
        return dateFormat(date, 'HH:MM');
    }

    // within past week
    const days = (new Date().getTime() - new Date(date).getTime()) / (1000*60*60*24*7);
    if (days < 7) {
        return dateFormat(date, 'ddd');
    }

    // over a week(!)
    return dateFormat(date, 'd mmm');
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default NotificationsHandlers;
