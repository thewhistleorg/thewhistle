Verification
======

Different projects have different requirements for reporter verification, so we allowed the level of verification to be defined for each project. The two verification options developed were reCAPTCHA and email verification.

reCAPTCHA
---------

reCAPTCHA is developed to prevent bots from using websites. This means that it is harder for malicious actors to populate our report data with large quantities of fake reports. Using reCAPTCHA has an added advantage that it helps to mitigate the risk of DDOS attacks. reCAPTCHA is disabled by default in local and staging versions of the system.

Email Verification
------------------

Email verification is particularly useful where reporters are expected to be part of a particular institution/organisation. For example, this worked well in the Everyday Racism use-case, as we wanted all reporters to be part of the University of Cambridge. This meant that we could impose the requirement that they had a University of Cambridge email address. The advantage of this method is that it prevents people from outside the given institution/organisation from submitting erroneous reports.
