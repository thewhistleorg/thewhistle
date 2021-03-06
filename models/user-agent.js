/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Record browser user agent.                                                 C.Veness 2017-2018  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import useragent    from 'useragent'; // parse browser user agent string
import { ObjectId } from 'mongodb';   // MongoDB driver for Node.js

import Db from '../lib/db.js';


class UserAgent {

    static async log(db, ip, headers) {
        const useragents = await Db.collection(db, 'useragents');

        const ignore = [
            '::ffff:127.0.0.1', // localhost
            '82.69.8.1',        // Chris
        ];
        if (ignore.includes(ip)) return;

        const ua = useragent.parse(headers['user-agent']);

        ua.agent = { os: ua.os, device: ua.device }; // os, device are only parsed on demand
        ua.ip = ip; // tmp for debug

        await useragents.insertOne(ua);
    }


    static async counts(db, since=null) {
        const useragents = await Db.collection(db, 'useragents');

        const sinceSecs = Math.floor(new Date(since)/1000).toString(16);
        const query = since ? { _id: { $gt: ObjectId(sinceSecs.toString(16)+'0000000000000000') } } : {};
        const uas = await useragents.find(query).toArray();

        // count instances: stackoverflow.com/questions/5667888#answer-28832203
        const browserCounts = uas.reduce((counts, ua) => (counts[ua.family+'-'+ua.major] = ++counts[ua.family+'-'+ua.major] || 1, counts), {});
        const osCounts      = uas.reduce((counts, ua) => (counts[ua.agent.os.family+'-'+ua.agent.os.major] = ++counts[ua.agent.os.family+'-'+ua.agent.os.major] || 1, counts), {});
        const deviceCounts  = uas.reduce((counts, ua) => (counts[ua.agent.device.family] = ++counts[ua.agent.device.family] || 1, counts), {});

        // convert to key,val tuples to be able to sort (desc) by frequency
        const counts = {
            browser: Object.keys(browserCounts).map(key => ({ key, val: browserCounts[key] })).sort((a, b) => a.val < b.val ? 1 : -1),
            os:      Object.keys(osCounts).map(key => ({ key, val: osCounts[key] })).sort((a, b) => a.val < b.val ? 1 : -1),
            device:  Object.keys(deviceCounts).map(key => ({ key, val: deviceCounts[key] })).sort((a, b) => a.val < b.val ? 1 : -1),
        };

        const first = Math.min(...uas.map(ua => ua._id.getTimestamp()));

        return {
            since: first==Infinity ? null : new Date(first),
            total: uas.length,
            count: counts,
        };
    }

}

export default UserAgent;
