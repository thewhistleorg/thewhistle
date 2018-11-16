/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  'Publish' app handlers                                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import json2csv from 'json2csv'; // converts json into csv
import process  from 'process';  // nodejs.org/api/process.html

import Report from '../models/report.js';

class AppPublishHandlers {

    /**
     * GET /metrics.html - list available metrics
     */
    static async getMetricsList(ctx) {
        // get all available organisations from db connection string environment variables
        // TODO: exclude -test orgs unless e.g. ?orgs=all
        const organisations = Object.keys(process.env)
            .filter(env => env.slice(0, 3)=='DB_' && env!='DB_USERS')
            .map(db => db.slice(3).toLowerCase().replace(/_/g, '-'));

        // use a set to get a list of distinct metrics
        const metricsSet = new Set();
        for (const org of organisations) {
            const reports = await Report.find(org, { publish: { $exists: true } });

            for (const rpt of reports) {
                // limit to WikiRate for the moment - this can be generalised later if required
                for (const metricName in rpt.publish.wikirate.metrics) {
                    const metric = {
                        org:     org,
                        project: rpt.project,
                        year:    rpt._id.getTimestamp().getFullYear(),
                        metric:  encodeURI(metricName).replace(/%20/g, '+'),
                    };
                    metricsSet.add(JSON.stringify(metric));
                }
            }
        }

        const context = {
            metrics: [ ...metricsSet ].map(metric => JSON.parse(metric)),
        };

        await ctx.render('list-metrics', context);
    }


    /**
     * GET /supply.html - list available supply-chain data
     */
    static async getSupplyList(ctx) {
        // get all available organisations from db connection string environment variables
        // TODO: exclude -test orgs unless e.g. ?orgs=all
        const organisations = Object.keys(process.env)
            .filter(env => env.slice(0, 3)=='DB_' && env!='DB_USERS')
            .map(db => db.slice(3).toLowerCase().replace(/_/g, '-'));

        // use a set to get a list of distinct metrics
        const supplySet = new Set();
        for (const org of organisations) {
            const reports = await Report.find(org, { publish: { $exists: true } });

            for (const rpt of reports) {
                const supply = {
                    org:     org,
                    project: rpt.project,
                    year:    rpt._id.getTimestamp().getFullYear(),
                };
                supplySet.add(JSON.stringify(supply));
            }
        }

        const context = {
            supply: [ ...supplySet ].map(supply => JSON.parse(supply)),
        };

        await ctx.render('list-supply', context);
    }


    /**
     * GET /:org/:project/wikirate/metrics/:year - export aggregated metrics as CSV
     *
     * TODO: respect Accept header to return JSON if requested
     * TODO: return all metrics if no 'metric' query?
     */
    static async getMetrics(ctx) {
        const org = ctx.params.org;
        const project = ctx.params.project;
        const year = ctx.params.year;
        const metric = ctx.request.query.metric;

        if (!metric) ctx.throw(404, 'No metric specified');

        // fetch all reports for this organisation/project
        const rpts = await Report.find(org, { project: project });

        // we're only interested in metrics for reports from given year with values for this metric
        const rptMetrics = rpts
            .filter(rpt => rpt._id.getTimestamp().getFullYear() == year && isNumeric(rpt.publish.wikirate.metrics[metric]))
            .map(rpt => rpt.publish.wikirate);

        if (rptMetrics.length == 0) ctx.throw(404); // TODO: or CSV with no rows?

        // group reports by company
        const groupedRpts = {};
        for (const rpt of rptMetrics) {
            const company = rpt.Company || '—';
            if (!groupedRpts[company]) groupedRpts[company] = [];
            groupedRpts[company].push(rpt);
        }

        // build the metrics which will be output as CSV

        const metrics = [];

        for (const company in groupedRpts) {
            const values = groupedRpts[company].map(rpt => Number(rpt[metric]));
            const metricBase = {
                Metric:  null,
                Company: company,
                Year:    year,
                Value:   null,
                Source:  `https://${ctx.request.host}/${org}/${org}/wikirate/metrics/${year}/${metric}.csv`,
                Comment: `${groupedRpts[company].length} submissions`,
            };
            metrics.push(Object.assign({}, metricBase, { Metric: `${metric} – mean`, Value: mean(values) }));
            metrics.push(Object.assign({}, metricBase, { Metric: `${metric} – median`, Value: median(values) }));
            metrics.push(Object.assign({}, metricBase, { Metric: `${metric} – min`, Value: Math.min(...values) }));
            metrics.push(Object.assign({}, metricBase, { Metric: `${metric} – max`, Value: Math.max(...values) }));
        }

        // convert the metrics to CSV
        const csv = json2csv.parse(metrics);

        ctx.response.body = csv;
        // note this returns Content-Type: text/plain; setting Content-Type to text/csv
        // automatically downloads the file
    }


    /**
     * GET /:org/:project/wikirate/supply/:year - export aggregated supply-chain metrics as CSV
     *
     * TODO: respect Accept header to return JSON if requested
     */
    static async getSupply(ctx) {
        const org = ctx.params.org;
        const project = ctx.params.project;
        const year = ctx.params.year;

        // fetch all reports for this organisation/project
        const rpts = await Report.find(org, { project: project });

        // we're only interested in supplier data for reports from given year
        const supplyData = rpts
            .filter(rpt => rpt._id.getTimestamp().getFullYear() == year)
            .map(rpt => rpt.publish.wikirate);

        if (supplyData.length == 0) { ctx.response.status = 404; return; } // TODO: or CSV with no rows?

        // group reports by company + supplier (use wacky ␟ group separator character to guarantee no conflict
        const groupedRpts = {};
        for (const rpt of supplyData) {
            const grp = `${rpt['Company']||'—'}␝${rpt['Related company']||'—'}`;
            if (!groupedRpts[grp]) groupedRpts[grp] = [];
            groupedRpts[grp].push(rpt);
        }

        // build the metrics which will be output as CSV

        const metrics = [];

        for (const grp in groupedRpts) {
            const [ company, supplier ] = grp.split('␝');
            const supplyBase = {
                Designer:          'Commons',
                Title:             null,
                Company:           null,
                'Related company': null,
                Year:              year,
                Value:             'Tier 1 Supplier',
                Source:            `https://${ctx.request.host}/${org}/${org}/wikirate/metrics/${year}.csv`,
                Comment:           `${groupedRpts[grp].length} submissions`,
            };
            metrics.push(Object.assign({}, supplyBase, { Title: 'Supplied By', Company: company, 'Related company': supplier }));
            metrics.push(Object.assign({}, supplyBase, { Title: 'Supplier of', Company: supplier, 'Related company': company }));
        }

        // convert the metrics to CSV
        const csv = json2csv.parse(metrics);

        ctx.response.status = 200;
        ctx.response.body = csv;
    }
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function mean(array) {
    const sum = array.reduce(function(a, b) { return a + b; });
    return sum / array.length;
}

function median(array) {
    array.sort(function(a, b) {
        return a - b;
    });
    const mid1 = Math.floor(array.length/2 - 0.5);
    const mid2 = Math.ceil(array.length/2 - 0.5);
    return (array[mid1] + array[mid2]) / 2;
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default AppPublishHandlers;
