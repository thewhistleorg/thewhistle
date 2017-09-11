Redgate down-tools week
=======================

During the week of 14–18 August 2017 [Redgate Software](https://www.red-gate.com/) selected The
Whistle as their non-profit organisation to support as part of their ‘down-tools week’.

They made a considerable team of software engineers and a smaller team of marketing people available
for the week to work on The Whistle. This was done in four teams:
 - _code refactor_ (UI/UX redesign of report submission process and of dashboard report details page)
 - _integration on older smartphones_ (investigate & address issues of report submission on older 
   devices)
 - _image/video processing_ (EXIF metadata from images, reverse image lookup, weather conditions on 
   report date/location)
 - _branding / marketing_


## Down-tools week technical notes by Vignesh (team 1) and Chris (teams 2, 3)

### Team 1 - UX and UI development

Team 1 focused on optimising the front-end code, redesigning the GRN's reporting interface and 
design & integration of Team 3a &3b's outputs for the admin report page.

Initially, the team tried to optimise the GRN front-end code. They reduced the code replication 
(there were static HTML pages for each page) by creating a general layout and partials to each step 
in the reporting interface.

#### UX Activity for the reporting interface:

UXer from RedDate did a UX review on the current reporting interface and then came up with an 
improved content structure for the incident reporting interface through a quick UX activity with the 
Team 1.

As a first step,  he created a user journey map of the incident reporting scenario. Based on this, 
he mocked up the UI for each step and then reordered the steps to make the reporting process more 
sensible to the user. 

From the day 2, the team 1 split into two sub-teams. Team 1a centred on implementing the new UI for 
the reporting interface and Team 1b on general layout and integrations for admin's report page.

In general, the team mostly prioritised on code optimisation, content structure and general 
usability compared to design aesthetics and look & feel.

#### Team 1a code changes:

- Created partials for reporting progress  - `partials/steppartial.html`
- Created layout for reporting steps - `layout/steplayout.html`
- Each step page now uses `steplayout- grn/*` -> `layout/steplayout.html`
- Removed all `required` HTML input attributes (since it is not compatible with many browsers)

_Next steps and code suggestion takeaways from Team 1a_:
- We should follow the above approach to optimise rest of the front-end code. and make use of 
  handlebarsJS' template feature
- Create reusable UI components.
- Use SASS or LESS for an effective CSS code (Recommended is LESS as it is lightweight and doesn't 
  require Ruby dependency for compiling)
- User websafe font for the reporting interface

#### Team 1b code changes:

- Removed tabs from the report page
- Merged all report page tabs into one file
- Designed and development of new report page interface with weather and image analysis UI
- Integrated Weather API code from Team 3c to weather UI
  - Weather UI has hard coded location , currently it is set to Abuja, Nigeria. 
    - In future we have to extract the location from the Report's location input. (Because users may 
      not always be specific about the locaiton.)
- Style tweaks to image analysis UI integration from Team 3a and 3b
- Fixed the commentary section bugs

Next steps and code suggestion takeaways from Team 1b:
- We need to create default layout for admin page and the `@body` of this layout yields the templates 
- the sections in Report page should be segregated. Eg. Commentary, weather, image analysis sections 
  could be a `partials`.
- Avoid using in page styles and javascript as it would be very difficult to manage.


### Team 2 – App compatibility on older platforms

Team 2 were looking at verifying the operation of the public incident submission on older platforms, 
in particular browser support on older smartphone devices.

They did this using a combination of [emulators](https://developer.android.com/studio) (e.g. Android 
and Blackberry 5) and physical devices (e.g. Samsung Galaxy S3, Blackberry Curve). They also tested 
on UC Browser and Opera Mini.

The current incident submission form uses latest JavaScript features (e.g. async, await; fetch API) 
for speed of development. This restricted compatibility to current desktop browsers and reasonably 
recent mobile devices.

The team identified JavaScript features which caused issues on older platforms; these comprise

 - use callbacks rather than async/await
 - use XMLHttpRequest rather than fetch API
 - use var declarations rather than const declarations
 - assign to .classList property rather than using .classList.add(), .classList.remove() methods
 - assign to form fields’ .textContent property rather than .value property
 - specify events in within HTML rather than in JavaScript (e.g. `<button onClick="function()">`)
 - set "Cache-Control: no-cache" header on ajax responses to prevent Internet Explorer caching ajax 
   responses
 - use HTML5 shiv to enable styling of HTML5 elements

Through use of these methods, the team extended compatibility to Android 5+ (Android 2+ dependant on 
server-side validation for generated name), UC Browser 11.4+, Internet Explorer 10+, Edge 12+, 
Blackberry Curve (dependant on server-side validation for generated name), Opera Mini 28+.

Platform             | Before   | After | notes
---------------------|----------|-------|-----------------------------
Android browser      | 5.0+     | 2.0+  | Various devices tested ¹ ² ³
Blackberry           | –        | ✓     | Curve 9320 tested ² ³
Chrome               | 55+      |       | 
Firefox              | 52+      |       | 
Internet Explorer    | Edge 15+ | 10+   | Desktop ²
Opera                | 42+      |       |
Opera Mini           | –        | 28+   | Samsung Galaxy SIII tested ²
Safari               | 10.1+    |       |
Safari iOS           | 10.3+    | 5.1+  | iPod Touch tested ²
UC Browser (Android) | –        | 11.4+ | Samsung Galaxy SIII tested ²

Notes: ¹ — tested on emulator; ² – tested on device (older versions may work); ³ – dependant on 
server-side validation for generated name.

Surprisingly, support for the `.querySelector()` method was found to be good, and there was no need 
to fall back on the older `.getElementById()`.

They observed that maximum compatibility would be achieved by avoiding any use of JavaScript. This 
would be at the expense of quality of user experience (page submission rather than ajax, server-side 
validation rather than in-browser validation, etc).


### Team 3a – EXIF metadata

Team 3a found a [JavaScript wrapper](https://www.npmjs.com/package/exiftool-vendored) for the 
[ExifTool](https://en.wikipedia.org/wiki/ExifTool) library, which extracts EXIF metadata from image, 
audio, and video files, and also extracts metadata from PDF files.

When EXIF data is available in an uploaded image or video, the data and location information will be 
extracted and recorded with the submitted report as ‘analysis’. This will be displayed beside 
images on the *report* details page.

Similarly, PDF metadata will be recorded for uploaded PDF documents (details TBD).

The extraction is done locally on the server, so there are no issues of data retention in the ‘cloud’.

A number of different libraries were compared; ExifTool handles the widest variety of metadata 
(including iPhone metadata), and is regularly updated with new devices as they appear on the market.

Of note is that ExifTool is a (Perl) Native Abstraction, which may complicate the application build 
process, and appears (on Windows) to be implemented as a service which may need to be explictly 
killed to release file locks.

The EXIF metadata fields used in the analysis are `GPSLatitude`, `GPSLongitude`, `GPSAltitude`, 
`CreateDate`.

### Team 3b – reverse image search

The reverse image search tests whether any images uploaded as part of an incident submission might 
have been obtained from the internet.

This is done by first searching the internet for matching images, and then obtaining a similarity 
rating for matched images.

The image search is currently done using *Google search by image*, since this is a free service. 
However, Google retain uploaded images and make no constraints about how they may use them, so in 
the longer term [Tineye](https://tineye.com) would probably be a more appropriate service, as they 
don't keep images. Tineye charges are in the region of $100/year for 5,000 image searches per year.

Once best matches are obtained from Google, a similarity rating is obtained using the 
[node-resemble-js](https://github.com/lksv/node-resemble.js) library.

The closest matches are then shown on the *report* details page for review by NGO staff.

Note that since this displays images from all over the internet, it currently requires suppressing 
the [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP); a long-term 
solution will need to be found for this.

To be determined is how successful this approach is at matching images which have been cropped or 
otherwise manipulated.

For videos uploaded as part of the incident report submission, the team found that there may be a 
thumbnail embedded as part of the metadata, and this thumbnail could be used for the Google or 
Tineye search, but did not have sufficient time to investigate this.

### Team 3c – weather information

If the incident report has a specific date (rather than an approximate range), then weather 
conditions are obtained for the relevant city and day from the 
[Weather Underground API](https://www.wunderground.com/weather/api/).

The Weather Underground API returns a number of observations at hourly intervals (TBC). These 
observations include the name of a weather icon, selected from 
![clear](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/clear.png), 
![cloudy](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/cloudy.png), 
![flurries](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/flurries.png), 
![fog](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/fog.png), 
![hazy](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/hazy.png), 
![mostlycloudy](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/mostlycloudy.png), 
![mostlysunny](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/mostlysunny.png), 
![partlycloudy](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/partlycloudy.png), 
![partlysunny](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/partlysunny.png), 
![rain](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/rain.png), 
![sleet](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/sleet.png), 
![snow](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/snow.png), 
![sunny](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/sunny.png), 
![tstorms](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/tstorms.png), 
![unknown](https://cdn.rawgit.com/manifestinteractive/weather-underground-icons/658823a8/dist/icons/black/png/16x16/unknown.png).

While Weather Underground icons are assumed to be proprietory, there is a matching 
[set of icons](https://www.npmjs.com/package/weather-underground-icons) available as open source 
which are used to represent the observations returned by Weather Underground.

Icons representing the Weather Underground observations are displayed on the *report* details page.

A free tier API licence is being used which limits requests to 500 per day, 10 per minute.

## Incorporation into canonical app

Post Redgate week, the Redgate work was rationalised & tidied up, and incorporated back into the 
main GitHub repository code (so far the code refactor & compatibility, the EXIF metadata, and the 
weather conditions have been incorporated; the reverse image search is currently still pending).

This was done using separate git topic branches. By using separate branches, code review/comparison 
of each can be readily made, using `git diff --stat` to list changed files, or `git difftool` for a 
visual diff of individual changes (e.g. using [p4merge](https://www.perforce.com/products/helix-apps/merge-diff-tool-p4merge)).

### redgate-analysis

Code for extracting EXIF metadata and fetching weather conditions (backend functions not involving 
UI).

```
$ git diff --stat 96a7fe^ 96a7fe
$ git difftool 96a7fe^ 96a7fe
```

### redgate-ui-report

Revised incident report submission process, including UI review & compatibility. This included 
adopting the use of Handlebars ‘layouts’ to minimise the boilerplate code repeated on each page of 
the submission; the early ‘scr’ and ‘wwww’ reporting trials were also migrated to this scheme.

```
$ git diff --stat 627c16^ 627c16
$ git difftool 627c16^ 627c16
```

### redgate-ui-admin

Revised dashboard report details page; the previous ‘tabs’ were replaced with a single, denser, 
layout.

```
$ git diff --stat 4e4f01^ 4e4f01
$ git difftool 4e4f01^ 4e4f01
```

Note that these diffs work by taking of diff of the branch _merge commit_ and its first parent; the 
first parent of a merge commit is the last commit prior to the branch being taken.
