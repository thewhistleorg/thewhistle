/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Notification model; handles notifying users of events and dismissing notifications.            */
/*                                                                                 C.Veness 2018  */
/* Currently, events that can be notified are:                                                    */
/*  - new report submitted                                                                        */
/*  - report assigned to user                                                                     */
/*  - user’s report received new comment                                                          */
/*  - user mentioned in comment                                                                   */
/* This list may change over time.                                                                */
/*                                                                                                */
/* Note on terminology: 'cancel' cancels a notification for all notified users; 'dismiss'         */
/* dismisses a user from a notification, the notification may remain for other users - if the     */
/* notification is  only for the user dismissing the notification, this is equivalent to cancel.  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { ObjectId } from 'mongodb'; // MongoDB driver for Node.js
import Debug        from 'debug';   // small debugging utility

const debug = Debug('app:db'); // db write ops

import Db from '../lib/db.js';


/*
 * A notification holds outstanding events which need to be notified to specific user(s) concerning
 * particular reports.
 */
const schema = {
    type:       'object',
    required:   [ 'event', 'users', 'report' ],
    properties: {
        _id:    { bsonType: 'objectId' },
        event:  { type: 'string' },                                 // event being notified
        users:  { type: 'array', items: { bsonType: 'objectId' } }, // users notification is for
        report: { bsonType: 'objectId' },                           // report notification relates to
    },
    additionalProperties: false,
};


// keep a record of the last time any changes are made to notifications (notify, dismiss, cancel):
// for notify calls, this is the timestamp of the created notification document (to facilitate
// robust tests); for dismiss calls, this is the current time
const lastUpdate = {};

class Notification {

    /**
     * Initialises 'notifications' collection; if not present, create it, add validation for it, and add
     * indexes.
     *
     * Currently this is invoked on any login, to ensure db is correctly initialised before it is
     * used. If this becomes expensive, it could be done less simplistically.
     *
     * @param {string} db - Database to use.
     */
    static async init(db) {
        debug('Notification.init', 'db:'+db);

        // if no 'notifications' collection, create it
        const collections = await Db.collections(db);
        if (!collections.map(c => c.s.name).includes('notifications')) {
            await Db.createCollection(db, 'notifications');
        }

        const notifications = await Db.collection(db, 'notifications');

        // in case 'notifications' collection doesn't have validation (or validation is updated), add it
        await Db.command(db, { collMod: 'notifications', validator: { $jsonSchema: schema } });

        // indexes
        notifications.createIndex({ report: 1 });
        notifications.createIndex({ event: 1, report: 1 });
        notifications.createIndex({ report: 1, users: 1 });
    }


    /**
     * Notifies user of event relating to report.
     *
     * @param   {string}   db - Database to use.
     * @param   {string}   event - Event notification relates to.
     * @param   {ObjectId} userId - Id of user to be notified.
     * @param   {ObjectId} reportId - Report notification relates to.
     * @returns Notification id.
     */
    static async notify(db, event, userId, reportId) {
        debug('Notification.notify', 'db:'+db, 'u:'+userId, 'r:'+reportId, event);
        const notifications = await Db.collection(db, 'notifications');

        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId);       // allow userId as string
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow reportId as string

        const values = {
            event:  event,
            users:  [ userId ],
            report: reportId,
        };

        try {

            const { insertedId } = await notifications.insertOne(values);

            lastUpdate[db] = insertedId.getTimestamp().toISOString().slice(0, -5); // track most recent updates

            return insertedId;

        } catch (e) {
            if (e.code == 121) throw new Error(`Notification of ${event} for ${userId} failed validation [notify]`);
            throw e;
        }
    }


    /**
     * Notifies multiple users of event relating to report.
     *
     * This is for events which all users may need to be aware of, such as 'new report submitted'.
     * If all users for a certain organisation/database are to be notified, they can be found by
     * invoking User.getForDb(db).map(u => u._id).
     *
     * @param   {string}     db - Database to use.
     * @param   {string}     event - Event notification relates to.
     * @param   {ObjectId[]} userIds - Ids of users to be notified.
     * @param   {ObjectId}   reportId - Report notification relates to.
     * @returns Notification id.
     */
    static async notifyMultiple(db, event, userIds, reportId) {
        debug('Notification.notifyMultiple', 'db:'+db, 'r:'+reportId, event);

        for (let id=0; id<userIds.length; id++) if (!(userIds[id] instanceof ObjectId)) userIds[id] = new ObjectId(userIds[id]); // allow userId as string
        // userIds.forEach(id => { if (!(id instanceof ObjectId)) id = new ObjectId(id); }); // allow userId as string
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow reportId as string

        const notifications = await Db.collection(db, 'notifications');

        const values = {
            event:  event,
            users:  userIds,
            report: reportId,
        };

        try {
            const { insertedId } = await notifications.insertOne(values);

            lastUpdate[db] = insertedId.getTimestamp().toISOString().slice(0, -5); // track most recent updates

            return insertedId;

        } catch (e) {
            if (e.code == 121) throw new Error(`Notification of ${event} for ${userIds} failed validation`);
            throw e;
        }
    }


    /**
     * Lists all notifications for event relating to given report.
     *
     * @param   {string}   db - Database to use.
     * @param   {string}   event - Event notification relates to.
     * @param   {ObjectId} reportId - Report notification relates to.
     * @returns {Object[]} Notifications.
     */
    static async listForReport(db, event, reportId) {
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow reportId as string

        const notifications = await Db.collection(db, 'notifications');

        const notificns = await notifications.find({ event: event, report: reportId }).sort({ _id: -1 }).toArray();

        return notificns;
    }


    /**
     * Lists all notifications for event for given user.
     *
     * @param   {string}   db - Database to use.
     * @param   {ObjectId} userId - Id of user.
     * @param   {string}   event - Event notifications relate to.
     * @returns {Object[]} Notifications.
     */
    static async listForUser(db, userId, event) {
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow userId as string

        const notifications = await Db.collection(db, 'notifications');

        const notificns = await notifications.find({ users: userId, event: event }).sort({ _id: -1 }).toArray();

        return notificns;
    }


    /**
     * Lists all notifications for debug purposes.
     *
     * @param   {string} db - Database to use.
     * @returns {Object[]} Notifications.
     */
    static async listDebug(db) {
        const notifications = await Db.collection(db, 'notifications');

        const notificns = await notifications.find({}).sort({ _id: -1 }).toArray();

        return notificns;
    }


    /**
     * Dismisses a notification for given user; if this notification is also for other users, they
     * will not be affected; if there are no other users, this cancels the notification.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} notificationId - Notification to be dismissed.
     * @param {ObjectId} userId - User notification is to be dismissed for.
     */
    static async dismiss(db, notificationId, userId) {
        debug('Notification.dismiss', 'db:'+db, 'n:'+notificationId, 'u:'+userId);

        if (!(notificationId instanceof ObjectId)) notificationId = new ObjectId(notificationId); // allow notificationId as string
        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId); // allow userId as string

        const notifications = await Db.collection(db, 'notifications');

        try {

            await notifications.update({ _id: notificationId }, { $pull: { users: userId } });

            // if the last user for this notification dismissed it, delete the notification
            const notification = await notifications.findOne(notificationId);
            if (notification && notification.users.length == 0) await notifications.deleteOne({ _id: notificationId });

            lastUpdate[db] = new Date().toISOString().slice(0, -5); // track most recent updates

        } catch (e) {
            if (e.code == 121) throw new Error(`Notification dismissal for ${userId} failed validation`);
            throw e;
        }
    }


    /**
     * Dismisses all notifications for a given user relating to a given report.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} userId - Id of user to be notified.
     * @param {ObjectId} reportId - Report notification relates to.
     */
    static async dismissForUserReport(db, userId, reportId) {
        debug('Notification.dismissForUserReport', 'db:'+db, 'u:'+userId, 'r:'+reportId);

        if (!(userId instanceof ObjectId)) userId = new ObjectId(userId);       // allow userId as string
        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow reportId as string

        const notifications = await Db.collection(db, 'notifications');

        try {
            await notifications.update({ report: reportId }, { $pull: { users: userId } });

            // check for any notifications that no longer have any users as a result
            const emptyNotifications = await notifications.find({ report: reportId, users: { $eq: [] } }).toArray();
            for (const notfcn of emptyNotifications) await notifications.deleteOne({ _id: notfcn._id });

            lastUpdate[db] = new Date().toISOString().slice(0, -5); // track most recent updates

        } catch (e) {
            if (e.code == 121) throw new Error(`Notification dismissals for ${userId}/${reportId} failed validation`);
            throw e;
        }
    }


    /**
     * Cancels a notification: this dismisses the notification for all users it was notifying.
     *
     * A 'new report submitted' notification will get cancelled (for all notified users) when the
     * report is assigned to a user.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} notificationId - Notification to be dismissed.
     */
    static async cancel(db, notificationId) {
        debug('Notification.cancel', 'db:'+db, 'n:'+notificationId);

        if (!(notificationId instanceof ObjectId)) notificationId = new ObjectId(notificationId); // allow notificationId as string

        const notifications = await Db.collection(db, 'notifications');

        await notifications.deleteOne({ _id: notificationId });

        lastUpdate[db] = new Date().toISOString().slice(0, -5); // track most recent updates
    }


    /**
     * Cancels all notification for a given report.
     *
     * This is for e.g. when a report is archived.
     *
     * @param {string}   db - Database to use.
     * @param {ObjectId} reportId - Report notifications relate to.
     */
    static async cancelForReport(db, reportId) {
        debug('Notification.cancelForReport', 'db:'+db, 'r:'+reportId);

        if (!(reportId instanceof ObjectId)) reportId = new ObjectId(reportId); // allow reportId as string

        const notifications = await Db.collection(db, 'notifications');

        await notifications.deleteMany({ report: reportId });

        lastUpdate[db] = new Date().toISOString().slice(0, -5); // track most recent updates
    }


    /**
     * Lists all events there are currently notifications for.
     *
     * @param   {string} db - Database to use.
     * @returns {string[]} List of events.
     */
    static async events(db) {
        const notifications = await Db.collection(db, 'notifications');

        const notificns = await notifications.find({}).toArray();

        const events = notificns.map(n => n.event).filter((n, pos, self) => self.indexOf(n) == pos).sort();

        return events;
    }


    /**
     * Returns timestamp of most recent notification (or change to notification).
     *
     * On app startup, this will lie, and report the timestamp of the first timestamp request after
     * app startup, which may force a few unnecessary fetches of the notification list, but that's
     * worth the simplicity of just holding the timestamp as a local variable rather than in the
     * database.
     *
     * Note this request is cheap, with no database lookup involved.
     *
     * @param   {string} db - Database to use.
     * @returns {string} Timestamp as ISO-8601 string (or empty string if no notifications).
     */
    static lastUpdate(db) {
        // if not set, set it now
        if (!lastUpdate[db]) lastUpdate[db] = new Date().toISOString().slice(0, -5);

        return lastUpdate[db];
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Notification;
