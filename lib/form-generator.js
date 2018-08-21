/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Form Generator.                                                                 C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fetch      from 'node-fetch';             // window.fetch in node.js
import jsonSchema from 'jsonschema';             // JSON schema validator
import $RefParser from 'json-schema-ref-parser'; // parse, resolve, and dereference JSON Schema $ref pointers
import fs         from 'fs-extra';               // fs with extra functions & promise interface
import dotProp    from 'dot-prop';               // get/set properties from nested objects using dot paths
import markdown   from 'markdown-it';            // markdown parser
import Debug      from 'debug';                  // small debugging utility
import util       from 'util';                   // nodejs.org/api/util.html

const debug  = Debug('app:report'); // debug each request

const md = markdown({ html: true });

import Db from './db.js';


global.forms = {};
global.built = {};


let schema = null;
let layout = null;


class FormGenerator {

    /**
     * Determine where given form is located: either locally within the 'spec' directory, or hosted
     * externally in a location specified by environment variable RPT_ORG_NAME (which will have
     * '/<org>/<project>.json' or '...yaml' suffixed).
     *
     * @param {string} org - Organisation report is for.
     * @param {string} project - Project (aka campaign).
     * @returns {string} Local path or fully qualified URL of form spec.
     */
    static async location(org, project) {
        // if 'org' is the test version, convert it to canonical organisation name
        org = org.replace(/-test$/, '');

        // does it exist locally? (in ./public/spec)
        const jsonSpecPath = `public/spec/${org}/${project}.json`;
        const yamlSpecPath = `public/spec/${org}/${project}.yaml`;
        if (await fs.exists(jsonSpecPath)) return jsonSpecPath;
        if (await fs.exists(yamlSpecPath)) return yamlSpecPath;

        // have we got an env var RPT_ORG_NAME specifying a remote location?
        const location = process.env[`RPT_${org.toUpperCase().replace('-', '_')}`];
        if (!location) return null; // nope!

        // does it exist remotely? (in the location given by env var RPT_ORG_NAME)
        const jsonSpecUrl = `${location}/${org}/${project}.json`;
        const yamlSpecUrl = `${location}/${org}/${project}.yaml`;
        const jsonSpecHead = await fetch(jsonSpecUrl, { method: 'HEAD' });
        if (jsonSpecHead.ok) return jsonSpecUrl;
        const yamlSpecHead = await fetch(yamlSpecUrl, { method: 'HEAD' });
        if (yamlSpecHead.ok) return yamlSpecUrl;

        // no such spec!
        return null;
    }


    /**
     * Check whether given reporting form exists.
     *
     * @param {string} org - Organisation report is for.
     * @param {string} project - Project (aka campaign).
     * @returns true if the form exists, false otherwise.
     */
    static async exists(org, project) {
        // if it's already built, we know it exists
        if (global.built[org + project]) return true;

        // otherwise it exists if we can locate it
        const location = await FormGenerator.location(org, project);
        return location != null;
    }


    /**
     * Parse the org/project form specification, and return a JavaScript object from the JSON/YAML
     * spec. Any $ref references in the form spec will be processed.
     *
     * @param {string} org - Organisation report is for.
     * @param {string} project - Project (aka campaign).
     * @returns {Object} The form specification as a JavaScript object.
     */
    static async spec(org, project) {
        // first time a build is invoked, load the schema and the overall layout (better here than
        // slowing down app startup)
        if (!schema) schema = await $RefParser.dereference('app-report/report-schema.yaml');
        if (!layout) layout = await fs.readFile('app-report/templates/layout.html', 'utf8');

        const location = await FormGenerator.location(org, project);
        if (!location) throw new Error(`Form schema ${org}/${project} not found`);

        // dereference the json/yaml - this processes all $ref pointers and returns a JavaScript object
        let spec = null;
        try {
            spec = await $RefParser.dereference(location);
        } catch (e) {
            throw new Error(e); // TODO: determine details
        }

        // validate the spec against the form schema
        const valid = jsonSchema.validate(spec, schema);
        if (valid.errors.length > 0) throw new Error(`Form schema ${org}/${project} validation errors: ${valid.errors.join(';')}`);

        return spec;
    }


    /**
     * Check whether given reporting form is already built.
     *
     * @param {string} org - Organisation report is for.
     * @param {string} project - Project (aka campaign).
     * @returns true if the form has been built, false otherwise.
     */
    static built(org, project) {
        // when a form is successfully built, it's recorded in global.built
        if (global.built[org + project]) return true;

        // otherwise it's not been built
        return false;
    }


    /**
     * Generate HTML for specified incident submission report, and build internal structures for
     * processing submitted data into 'prettified' format to be recorded in the database.
     *
     * The generated HTML will be written to .generated-files/<org>/<project>; the internal data
     * structures are recorded in global.forms.
     *
     * The form will be built even if it has already been built, in order that externally hosted
     * form specs can be updated without restarting the app.
     *
     * @param {string} org - Organisation report is for.
     * @param {string} project - Project (aka campaign).
     */
    static async build(org, project) {
        debug('FormGenerator.build', org, project);
        const t1 = Date.now();

        // check form spec exists
        if (!(await FormGenerator.exists(org, project))) {
            const e = new Error(`Form spec ${org}/${project} not found`);
            e.status = 404;
            throw e;
        }

        // initialise global.forms, where info about inputs, steps, & defaults is held
        global.forms[`${org}/${project}`] = { inputs: {}, steps: {}, defaults: {} };

        try {
            const spec = await FormGenerator.spec(org, project);

            let singlePageRpt = '';
            const flash = '{{> flash}}\n';
            const notworking = '{{> notworking}}';
            let finalNext = '';

            // report version is recorded in db in order that CSVs can be generated with full
            // details even if report questions change
            global.forms.version = spec.version || 0;

            for (const p in spec.pages) {
                debug('build ----------------------------------------------', p);

                const page = p.match(/^p[0-9+]$/) ? p.slice(1) : p; // strip initial 'p' from numeric pages

                global.forms[`${org}/${project}`].inputs[page] = {};

                const prev = dotProp.get(spec, `options.pages.${p}.prev`)===false ? '' : '{{> back}}\n';
                const step = dotProp.get(spec, `options.pages.${p}.step`)===false ? '' : '{{> step}}\n';
                const nextText = dotProp.get(spec, `options.pages.${p}.next`) || 'Submit and continue';
                const next = dotProp.get(spec, `options.pages.${p}.next`) === false ? '' : `{{> continue text='${nextText}' accesskey='c' }}\n`;
                if (dotProp.get(spec, `options.pages.${p}.next`)) finalNext = next; // kludgy way to pick up final page 'next' button!

                const bodyHtml = FormGenerator.transformBody(org, project, page, spec.pages[p], null);
                const formMethod = dotProp.get(spec, `options.pages.${p}.method`) || 'post';
                const formEnctype = dotProp.get(spec, `options.pages.${p}.enctype`) || 'application/x-www-form-urlencoded';
                const pageTitle = dotProp.get(spec, `options.pages.${p}.title`) || dotProp.get(spec, 'title') || 'The Whistle Incident Report';

                const html = layout
                    .replace(/{{page-title}}/g, pageTitle)
                    .replace('{{{@body}}}', prev + step + flash + bodyHtml + next + notworking)
                    .replace('{{form-method}}', formMethod)
                    .replace('{{form-enctype}}', formEnctype);

                try {
                    await fs.writeFile(`.generated-reports/${org}/${project}-${page}.html`, html);
                } catch (e) {
                    switch (e.code) {
                        case 'ENOENT': // presumably directory does not exist
                            await fs.mkdir(`.generated-reports/${org}`);
                            await fs.writeFile(`.generated-reports/${org}/${project}-${page}.html`, html);
                            break;
                        default: // ??
                            throw e;
                    }
                }

                if (!isNaN(page)) singlePageRpt += bodyHtml;

                if (dotProp.get(spec, `options.pages.${p}.step`) !== false) global.forms[`${org}/${project}`].steps[page] = { page: page };
            }

            // note for single page report, in principle we could use yaml options.pages['*'] to
            // manage back, step, flash,  next: would that be worthwhile, or can we just use these
            // fixed options?
            const singlePageHtml = layout
                .replace(/{{page-title}}/g, dotProp.get(spec, 'title') || 'The Whistle Incident Report')
                .replace('{{{@body}}}', flash + singlePageRpt + finalNext + notworking)
                .replace('{{form-method}}', 'post')
                .replace('{{form-enctype}}', 'multipart/form-data');
            await fs.writeFile(`.generated-reports/${org}/${project}-+.html`, singlePageHtml);

            global.built[org+project] = true;

            const t2 = Date.now();
            debug('build ----------------------------------------------');
            debug('global.forms', util.inspect(global.forms[`${org}/${project}`], { depth: null, colors: true }));
            debug('build ==============================================', Math.ceil(t2-t1)+'ms');
        } catch (e) {
            console.error('FormGenerator.build', e);
            const err = new Error(`Form spec ${org}/${project} build failed: ${e.message}`);
            err.status = 410; // Gone
            throw err;
        }
    }


    /**
     * Transform the JSON (/YAML) form spec for given page into HTML.
     *
     * @param {string} org - Organisation report is for.
     * @param {string} project - Project (aka campaign).
     * @param {string} page - Page number (or name).
     * @param {string} json - The JSON specification to be transformed
     * @param {Object|null} parent - for recursive call to handle subsidiary inputs, the parent input.
     * @returns {string} HTML for this report page (or subsidiary section).
     */
    static transformBody(org, project, page, json, parent) {
        let html = '';
        const topLevel = !parent;

        for (const item of json) {
            // the spec is an array of objects which each have a single property, so the item type
            // is the key of the first property
            const itemType = Object.keys(item)[0];
            switch (itemType) {
                case 'text':
                    if (typeof item[itemType] == 'object') {
                        // object containing wrap/class/text items, and/or alternative texts:
                        // separate out wrap/class/text from alternate texts
                        const { wrap, class:cssClass, text, ...alternateTexts } = item[itemType];
                        if (Object.keys(alternateTexts).length == 0) {
                            // regular 'text' object with simple 'text' attribute (no alternate texts)
                            html += `<${wrap||'p'} class="${cssClass?cssClass+' ':''}">${text}</${wrap||'p'}>\n`;
                        } else {
                            // parameterised option texts: assume any one 'text' will depend on only one variable!
                            const keys = Object.keys(alternateTexts).map(v => v.split(':')[0]);
                            const [ key ] = [ ...new Set(keys) ];
                            const vals = Object.keys(alternateTexts).map(v => v.split(':')[1]);
                            const texts = Object.values(alternateTexts);
                            for (let i=0; i<vals.length; i++) {
                                // a handlebars helper sets 'show'/'hide' classes according to previously entered information
                                const classAttr = `class="${cssClass?cssClass+' ':''}{{show ${key} '${vals[i]}'}}"`;
                                // the data- attribute is used to show/hide alternate texts on same page as determining question
                                const dataAttr = `data-${key}="${vals[i]}"`;
                                // the html is either a <p>, or else an element determined by the 'wrap' option
                                html += `<${wrap||'p'} ${classAttr} ${dataAttr}>${texts[i]}</${wrap||'p'}>\n`;
                            }
                        }
                        break;
                    } else {
                        // plain text item
                        html += md.render(item[itemType]) + '\n';
                    }
                    break;
                case 'html':
                    html += item[itemType];
                    break;
                case 'input':
                    const input = item[itemType];
                    if (input.type!='button' && input.type!='recaptcha-button' && topLevel) html += `<ul class="question-${input.name}">\n`;
                    html += FormGenerator.transformInput(org, project, page, input, parent);
                    if (input.type!='button' && input.type!='recaptcha-button' && topLevel) html += '</ul>\n';
                    break;
            }
        }

        return html;
    }


    /**
     * Transform the JSON (/YAML) form spec for given input into HTML, and record details (in
     * global.forms) for processing the input submitted data into 'prettified' format to be
     * recorded in the database.
     *
     * @param {string} org - Organisation report is for.
     * @param {string} project - Project (aka campaign).
     * @param {string} page - Page number (or name).
     * @param {Object} input - The input to be transformed.
     * @param {Object|null} parent - for recursive call to handle subsidiary inputs, the parent -
     *   for radio/checkboxes, this will be hierarchically above the current input, for select
     *   inputs, it will be adjacent to the input.
     * @returns {string}
     */
    static transformInput(org, project, page, input, parent) {
        const rptPage = global.forms[`${org}/${project}`].inputs[page];
        let html = '';

        const topLevel = !parent;
        const fullName = parent ? `${parent.name}-${input.name}` : `${input.name}`;
        const subsidiaryOfSelect = !topLevel && parent.type=='select';
        // note for radio/checkboxes, the subsidiary input name is dependent on the selected option;
        // for selects, the subsidiary input name is constant

        // get relevant label for radio/checkbox input, or for select

        // ... convert top level 'options' nodeList to array so that we can filter it (nodeLists
        // don't have a filter() method)
        const topLevelOptions = topLevel ? [] : [ ...Object.values(parent.options) ];
        // note for radio/checkboxes, parent.options is the array of objects from form spec
        // representing each option; for selects, it is a simple array of labels (= submitted values)

        // ... filter top level options to just parent of this input (no-op for select)
        const [ parentOption ] = topLevelOptions.filter(option  => {
            return option && option.subsidiary
                && option.subsidiary.filter(el => el.input && el.input.name == input.name).length>0;
        });
        // ... parentOption is an object containing the label and the subsidiary, inter alia
        const parentOptionLabelRadioCheckbox = topLevel||subsidiaryOfSelect ? '' : parentOption.label;
        const parentOptionLabelSelect = topLevel ? '' :  parent.label;
        const parentOptionLabel = subsidiaryOfSelect ? parentOptionLabelSelect : parentOptionLabelRadioCheckbox;

        switch (input.type) {
            case 'text':
            case 'hidden':
            case 'textbox':
                // set global.forms mapping
                if (topLevel) {
                    rptPage[input.name] = { label: input.label || input.placeholder || '' };
                } else {
                    if (subsidiaryOfSelect) {
                        const options = topLevel||!subsidiaryOfSelect ? {} : parent.options.reduce((acc, opt) => { acc[opt==null?'':opt] = fullName; return acc; }, {});
                        rptPage[parent.name].subsidiary = options;
                    } else { // radio/checkbox
                        if (!rptPage[parent.name].subsidiary) rptPage[parent.name].subsidiary = {};
                        rptPage[parent.name].subsidiary[parentOptionLabel] = fullName;
                    }
                }
                // output html
                if (input.type == 'textbox') {
                    if (topLevel) html += '<li>\n';
                    if (input.label) html += `<label for="${fullName}">${input.label}</label>`;
                    html += `<textarea name="${fullName}" id="${fullName}" class="pure-input-1">{{${fullName}}}</textarea>\n`;
                    if (topLevel) html += '</li>\n';
                } else { // text, hidden
                    if (input.label) html += `<label for="${fullName}">${input.label}</label>`;
                    html += `<input type="${input.type}" name="${fullName}" id="${fullName}" value="{{${fullName}}}" placeholder="${input.placeholder||''}" class="${input.class||'pure-input-1'}">\n`;
                }
                break;
            case 'radio':
            case 'checkbox':
                // set global.forms mapping
                rptPage[input.name] = Object.assign(rptPage[input.name] || {}, { label: input.label }); // TODO TODO: p7 don't zap previous radio button entry!
                // output html
                html += `{{#checked ${input.name}}}\n`;
                for (const [ key, val ] of Object.entries(input.options)) {
                    // key gets concatenated with input.name to make the input id; val is the option object
                    const label = typeof val == 'string' ? val : val.label;
                    const attrs = {
                        type:  input.type,
                        name:  input.name,
                        id:    `${input.name}-${key}`,
                        value: label, // TODO: value key or label?
                    };
                    if (input.attributes) { // eg ??
                        for (const attr of input.attributes.split(' ')) {
                            const [ v, k ] = attr.split('=');
                            attrs[v] = k || 'true';
                        }
                    }
                    if (val.attributes) {   // eg used-before:n=checked, on-behalf-of:self=checked
                        for (const attr of val.attributes.split(' ')) {
                            const [ v, k ] = attr.split('=');
                            attrs[v] = k || 'true';
                            if (attr == 'checked') {
                                // record initially checked options to enable alternate texts to work
                                // on same page as input determining alternate text selection
                                global.forms[`${org}/${project}`].defaults[input.name] = val.label;
                            }
                        }
                    }
                    const attributes = [ ...Object.entries(attrs) ].map(([ attrKey, attrVal ]) => `${attrKey}="${attrVal}"`);
                    html += '<li>\n';
                    html += `  <input ${attributes.join(' ')}>\n`;
                    html += `  <label for="${input.name}-${key}">${label}</label>\n`;

                    // does this input have a subsidiary div for supplementary information?
                    if (val.subsidiary) {
                        const [ option ] = val.subsidiary.filter(s => s.option); // we should only have one 'option' property!
                        const hide = option && option.option=='show' ? '' : ' hide'; // TODO: handle multiple options
                        const [ cssClass ] = val.subsidiary.filter(s => s.class);
                        html += `<div class="subsidiary ${cssClass && cssClass.class ? cssClass.class : ''}${hide}">\n`;
                        html += FormGenerator.transformBody(org, project, page, val.subsidiary, input);
                        html += '</div>\n';
                    }

                    html += '</li>\n';
                }
                // }
                html += '{{/checked}}\n';
                break;
            case 'select':
                // set global.forms mapping
                if (topLevel) {
                    rptPage[input.name] = { label: input.label!=undefined ? input.label : parent.label };
                } else {
                    if (!rptPage[parent.name].subsidiary) rptPage[parent.name].subsidiary = {};
                    rptPage[parent.name].subsidiary[parentOptionLabel] = fullName;
                }
                // output html
                if (topLevel) html += '<li>\n';
                html += `  <select name="${fullName}" id="${fullName}">\n`;
                html += `  {{#selected ${fullName}}}\n`;
                for (const val of input.options) {
                    html += `    <option>${val==null?'':val}</option>\n`;
                }
                html += '  {{/selected}}\n';
                html += '  </select>\n';

                // does this input have a subsidiary div for supplementary information?
                if (input.subsidiary) {
                    const [ option ] = input.subsidiary.filter(s => s.option); // we should only have one 'option' property!
                    const hide = option && option.option=='show' ? '' : ' hide'; // TODO: handle multiple options
                    const [ cssClass ] = input.subsidiary.filter(s => s.class);
                    html += `<div class="subsidiary ${cssClass && cssClass.class ? cssClass.class : ''}${hide}">\n`;
                    html += FormGenerator.transformBody(org, project, page, input.subsidiary, input);
                    html += '</div>\n';
                }

                if (topLevel) html += '</li>\n';
                break;
            case 'recaptcha-button':
                input.class += ' g-recaptcha';
                const sitekey = process.env.RECAPTCHA_SITE_KEY;
                if (!sitekey) throw new Error('No environment variable found for ReCAPTCHA site key');
                html += `<button type="submit" name="${input.name||''}" value="${input.value||''}" accesskey="${input.accesskey||''}" class="${input.class||''}"`;
                html += ` data-sitekey="${sitekey}"`;
                html += ' data-callback="reCaptchaSubmitCallback"';
                html += '>\n';
                html += `${input.text}\n`;
                html += '</button>\n';
                break;
            case 'button':
                html += `<button type="submit" name="${input.name||''}" value="${input.value||''}" accesskey="${input.accesskey||''}" class="${input.class||''}"`;
                if (input.data) {
                    for (const [ key, val ] of Object.entries(input.data)) html += ` data-${key}="${val}"`;
                }
                html += '>\n';
                html += `${input.text}\n`;
                html += '</button>\n';
                break;
            case 'library-date':
                html += htmlLibraryDate; // TODO: ${input.name} [date]
                break;
            case 'library-24hours':
                html += htmlLibrary24hours; // TODO: ${input.name} [date]
                break;
            case 'library-file':
                html += '<li>\n';
                if (input.label) html += `<label for="${fullName}">${md.render(input.label)}</label>`;
                html += htmlLibraryFile; // TODO: ${input.name} [documents]
                html += '</li>\n';
                break;
        }

        debug(`input${topLevel?' ':'>'}`, fullName, `<${input.type}>`, topLevel?input.label:parentOptionLabel+'(...)');
        return html;
    }


    /**
     * Save a JSON/YAML form specification.
     *
     * @param {string} db - Database to use.
     * @param {string} page - name of the page.
     * @param {string} specification - Form specification as JSON or YAML text.
     */
    static async saveSpecification(db, page, specification) {
        const specs = await Db.collection(db, 'form-specifications');

        const query = { page: page };
        const update = { page: page, specification: specification };

        await specs.update(query, update, { upsert: true });
    }


    /**
     * Get a JSON/YAML form specification.
     *
     * @param   {string} db - Database to use.
     * @param   {string} page - name of the page.
     * @returns {string} Form specification as JSON or YAML text.
     */
    static async getSpecification(db, page) {
        const specs = await Db.collection(db, 'form-specifications');

        const spec = await specs.findOne({ page: page });
        return spec ? spec.specification : '';
    }
    
}


/*
 * Template HTML for library-date
 */
const htmlLibraryDate = `
    <table class="inline">
        <tr class="field-label">
            <td>DD</td>
            <td>MMM</td>
            <td>YYYY</td>
        </tr>
        <tr>
            <td>
                <select name="date.day" id="date.day" class="w4">
                    {{#selected date.day}}
                    {{#incidentDate.days}}
                    <option value="{{this}}">{{this}}</option>
                    {{/incidentDate.days}}
                    {{/selected}}
                </select>
            </td>
            <td>
                <select name="date.month" id="date.month" class="w5">
                    {{#selected date.month}}
                    {{#incidentDate.months}}
                    <option value="{{this}}">{{this}}</option>
                    {{/incidentDate.months}}
                    {{/selected}}
                </select>
            </td>
            <td>
                <select name="date.year" id="date.year" class="w6">
                    {{#selected date.year}}
                    {{#incidentDate.years}}
                    <option value="{{this}}">{{this}}</option>
                    {{/incidentDate.years}}
                    {{/selected}}
                </select>
            </td>
        </tr>
    </table>
`;


/*
 * Template HTML for library-24hours
 */
const htmlLibrary24hours = `
    <select name="date.time" id="date.time">
        <option></option>
        {{#selected date.time}}
        {{#incidentDate.hours}}
        <option value="{{this}}">{{this}}</option>
        {{/incidentDate.hours}}
        {{/selected}}
    </select>
`;


/*
 * Template HTML for library-file
 */
const htmlLibraryFile = `
    <input type="file" name="documents" id="document0" value="0" class="upload-file">
`;


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default FormGenerator;
