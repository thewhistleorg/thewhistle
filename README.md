The Whistle — Human rights abuses reporting platform
============================================================

[The Whistle](http://thewhistle.org) is a [Cambridge University](https://www.cam.ac.uk/) project
developed as part of the [ChainReact](http://chainreact.org/) project within the
[Horizon 2020](https://ec.europa.eu/programmes/horizon2020/) programme.

For further information on aims and objectives, please refer to The Whistle
[website](http://thewhistle.org).

Current prototypes
------------------

There are still some early investigations which are retained for reference, but are not relevant
to immediate development. These will be tidied up in time, but for the moment the relevant prototypes
are:

- Global Rights Nigeria public incident report submission:
  [report.thewhistle.org/grn-test/rape-is-a-crime](http://report.thewhistle.org/grn-test/rape-is-a-crime)
- Dashboard for admin/management: [admin.thewhistle.org](http://admin.thewhistle.org)
- Single-page incident report submission form (for GRN staff / paralegals):
  [report.thewhistle.org/grn-test/rape-is-a-crime/*](http://report.thewhistle.org/grn-test/rape-is-a-crime/*)


Architecture
------------

The Whistle is [Node.js](https://nodejs.org/en/) application built on the [Koa](http://koajs.com/)
framework, hosted on [Heroku](https://www.heroku.com), [mLab](https://mlab.com/), and Amazon
[AWS S3](https://aws.amazon.com/s3/).

The full app comprises a number of ‘composed’ sub-apps:

- The main app is on the `admin.` subdomain, and provides dashboard, management, and reporting
  facilities. In cases where incident reports are submitted by NGO staff and/or paralegals, this
  is also done within the *admin* sub-app. All functionality of the *admin* sub-app requires
  logging-in.
- For cases where incident reports can be submitted by members of the public, there is a *report*
  sub-app on the `report.` subdomain.
- It is planned that there will be a TextIt sub-app, and possibly others, to facilitate alternate
  channels for incident reporting.

### Databases

MongoDB is used for database storage.

Data for each organisation using The Whistle is stored in a separate database. The rationale for
this is that it gives assurance that an organisation’s data will not be visible to other
organisations. Reports from one database are visible at a time; if a user has access rights to more
than one database (for example, with separate databases used for separate branches of a larger
organisation), the database is selected on login.

A single central database is used for user access management. This specifies which organisation(s)
each user belongs to, and hence which database(s) they have access to (as well as, potentially, what
roles they have). MongoDB database connection strings are held in environment variables, indexed via
the user’s organisation (set up in `app.js`).

### Independent hosting

For even greater independence, organisations could even organise their own hosting arrangements for
The Whistle app. In this case even The Whistle staff would not have access to the data. The app
would have to be cloned from the Git repository, and organisations would require sufficient
technical expertise to set up and configure their own Node.js hosting and install the app from the
Git repository.

### Anonymity

While victims’ / survivors’ contact details may optionally be stored if required, the normal way of
identifying victims / survivors is by auto-generated identifying aliases.

### Security

Standard best practice has been used with regard to security.

The site uses `https` protocol over SSL transport layer to encrypt all communications and secure
them against interception [*note: to be implemented*].

Protection against attacks is further supported by use of
[Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) (CSP) headers,
[HTTP Strict Transport Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security) (HSTS) headers,
[X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options) headers,
[X-XSS-Protection](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection) headers, and
[X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options) headers.

Personally-identifying information is only stored when desired by the NGO and with consent of the
victim / survivor. All passwords are stored as encrypted hashes (using
[scrypt](https://en.wikipedia.org/wiki/Scrypt) key derivation function). These measures mean that
even in the case of a data breach, negative impact is minimised.

Physical and network infrastructure data security is achieved through hosting with Heroku and mLab,
which in turn host within Amazon data centres. There is probably no safer physical location for data.

Amazon European data centres are used for application code and data, so European jurisdiction
applies.

Backups are run by a cron job on Chris’s machine, and stored on Amazon AWS S3.

#### Password management

Passwords are stored as [scrypt](https://en.wikipedia.org/wiki/Scrypt) hashes.

The only way to reset passwords is by requesting a password reset e-mail. If the supplied e-mail
is recognised, a password reset e-mail is sent with a link which includes a limited-lifetime
single-use reset token. This link leads to an authenticated page which can be used to reset the
password.

#### Login / remember-me

No server-side sessions are used for logins. Rather, [JSON Web Tokens](https://jwt.io/) are used for
authentication.

These are held in secure signed [cookies](https://www.npmjs.com/package/cookies), included in the
headers in each HTTP request. The tokens are valid for 24 hours – hence even if security is breached
and the token obtained, it would have no value after 24 hours. If *remember-me* is not used, the
cookie the token is stored in is destroyed at the end of the browser session; if *remember-me* is
used, then the cookie will be made valid for 7 days; when the JSON Web Token expires, it will be
renewed for another 24 hours, and the cookie renewed for 7 days; hence the 'remember-me' function
will lapse after 7 days inactivity.


Incident Reporting
------------------

The content of incident reports will vary between organisations and between individual projects.

Individual incident reports are hence held in a flexible manner as JSON objects within the `reports`
collection in the MongoDB database (normally as key-value tuples, but potentially including more
complex structures).

When incident reports are submitted, some items of information are expected to be transferred to
report metadata:
- alias: the auto-generated identifying alias
- geocode: the results of Google Maps API geocoding
- files: any images or documents uploaded as part of the incident report submission.

Other metadata is added through the workflow of managing submitted incident reports, including:
- assignedTo
- status
- tags
- comments
- archived

### Uploaded files

Images or documents associated with an incident report may be uploaded as part of the submission.

Since Heroku has no persistent storage outside the Git repository the app is built from, these files
are stored on Amazon AWS S3. Requests for these files are then proxied through to S3.

### Audit trail

An audit trail of all updates to incident reports is maintained. This is held in a separate
*updates* collection, indexed by user-id and report-id. In addition, a *views* field within the
reports collection records the last time a report has been viewed by a user.


Logging
-------

Access logs and error logs are recorded in the `users` database, in a
[capped collection](https://docs.mongodb.com/manual/core/capped-collections/) (limited to 1,000
entries).

Requests for static files are not logged, as they are generally of no interest. For logged-in access,
the organisation and user are logged, and the user-agent is also logged. For status 500 errors, the
full stack trace is recorded (and Chris is notified by e-mail).

Only access to the production environment is normally logged.

The [access log](/dev/log-access) and [error log](/dev/log-error) pages provide facilities to filter
the log to items of interest.


Test Suite
----------

A test suite (compring unit tests run on the code directly, and integration/acceptance tests run
on the web service using the [superagent](https://www.npmjs.com/package/superagent)-based
[suptertest](https://www.npmjs.com/package/supertest)) is set up using the [mocha](https://mochajs.org/)
test framework and [chai](http://chaijs.com/) assertion library.
[Istanbul](https://www.npmjs.com/package/istanbul) is used for code coverage; code coverage is used
as a guide to complete test suites, not as a 100% target.

Continuous integration tests have been set up using CircleCI; CI tests are run on every push to the
GitHub master, hence no code will be released to staging without passing the test suite (promotion
from staging to production is a manual task; see the [development workflow](/dev/notes/development-workflow)).
