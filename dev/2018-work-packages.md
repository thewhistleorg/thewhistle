Development Work Packages for 2nd-half 2018
===========================================

This is an overview of work packages we have in view (as of end-June) for completion by the end of the year, to assist in planning division of work among development team.


Outstanding dashboard tasks
---------------------------

- list of minor ‘chores’ in Pivotal Tracker
- assorted ‘todo’ items tagged within code


General dashboard work
----------------------

- revisit user’s actual ‘dashboard’ page
  - our original ideas for the dashboard included support to staff workflow in managing reports, including such features as unassigned reports and recent activity (across the team), and for individual users, newly assigned reports, recently viewed reports, reports where user is recently mentioned, new comments on reports assigned to user, etc; some of these have now been covered by the notifications system, but others probably not
- consideration of analysis reports which might be required
  - again, original plans foresaw various synthetic overview reports, but we never had time to give thise idea further consideration 
- revisit digital verification support
  - initial work was done on extracting EXIF data from images, and obtaining weather conditions for given locations/times, and work was parked on reverse image lookup; a major objective initially was to support and enhance the overall process of digital verification, which could be returned to


Twilio SMS reporting
--------------------

- now that we have report specs in JSON (/YAML), we could look into implementing SMS reporting facilities based on the same specs as are used to generate forms for web-based reporting
- this could be done as an integral part of HFRN development


Humans for Rights Network
-------------------------

- implement subset of reports using report generator: HFRN & FAST, long & short, in English & French (total 8 reports)
- revise report generator with whatever updates are required to extend functionality from GRN requirements to HFRN requirements
- review mechanism for uploading files and extend file upload tests (this has received rather little attention as it was not a priority for GRN)
- implement greater independence of login usernames between organisations
- plan mechanism for managing dashboard groups to enable HFRN to manage reports submitted by various associated groups
- implement groups mechanism, together with test suite (integration tests & front-end tests)


Mirror Group
------------

- review functionality with Bangladesh potential reporters
- implement extra functionality required for Mirror Group reporting
- plan what information should be shared with WikiRate
- plan how WikiRate information should be extracted from submitted reports
- look into technical implementation of intermediate data store
- plan API for The Whistle to submit information to intermediate data store
- plan API for WikiRate to access information from intermediate data store


Interactive report designer
---------------------------

- consider functionality required to be able to interactively design GRN & HFRN reports
- investigate tools / libraries which could be used
- implement report designer, together with test suite
