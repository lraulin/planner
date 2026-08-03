---
source_url: "http://www.effexis.com/achieve/GoogleCalendarSync/"
title: "Google Calendar Sync"
scraped_at: 2026-08-03T15:15:05Z
---

# Google Calendar Sync

_Archived from [http://www.effexis.com/achieve/GoogleCalendarSync/](http://www.effexis.com/achieve/GoogleCalendarSync/)_

---

# Getting Started With Google Calendar Sync

Hello and welcome to the getting started with Achieve Planner's Google Calendar Sync web page. This page contains some important information about the sync support between Achieve Planner and Google Calendar.
[IMPORTANT time zone limitations during the sync](#TimeZoneLimitations) (for travelers)
Table of Contents

- [The Google Calendar Sync Dialog](#SyncDialog)
- [Enabling two way sync with Google Calendar](#TwoWaySync)
- [ Syncing to a non-default calendar in your Google account](#NonDefaultCalendar)
- [ Time Zone limitations during Google Calendar sync](#TimeZoneLimitations)
  **The Google Calendar Sync Dialog**
  You can launch the Google Calendar Sync dialog window by using the **Tools - > Google Calendar Sync** menu item.
  NOTE: Due to regular changes in the Google Calendar interface, please be CAREFUL when using the 'Propagate Deleted Appointments' option. Make sure you understand which appointments are getting deleted and use the 'Warn Before Deleting Items' box.
  This will launch up the Google Calendar Sync dialog where you can start the sync.
  Here's what each item in this dialog does:
- **Status** \- Displays the current status of the sync
- **Sync Now** \- Start the sync using the settings in the dialog
- **Stop** \- Abort the sync operation as soon as possible (may leave Achieve Planner and Google Calendar in an inconsistent state)
- **Login Name** \- Your login for the Google Calendar (usually your gmail address)
- **Change Password** \- Change the stored password used to log in to your Google Calendar account
- **Calendar ID** \- Use to sync with a different calendar than your default Google Calendar account calendar. You may want to do this to limit who can see your calendar data. Leave this blank to use your default calendar in your Google account.
  NOTE: Changing the Calendar ID value **after** you've already synced with a different Google Calendar could result in duplications (and/or deleted appointments/events if **Propagate Deleted Appointments/Events** is checked). Learn more about Changing Google Calendar ID
- **Import From Google Calendar** \- Check this to import Google Calendar entries into Achieve Planner during the sync
- **Sync Reminders** \- If checked, reminders are synced between Achieve Planner and Google Calendar. Uncheck if you DON'T want to sync reminders for appointments and events (original reminders are not affected, but imported/exported items will NOT have reminders set)
- **Propagate Deleted Appointments/Events** \- If checked, the sync will attempt to delete appointments/items in Achieve Planner and/or Google Calendar when the corresponding & previously synced appointment/item is not found. The Import and/or Export flags determine the direction(s) in which the deletions are propagated. BE CAREFUL when using this option.
  NOTE: Due to limitations in the Google calendar sync interface. Recurring appointments deletions are NOT propagated even if this box is checked. You must manually delete these recurring items in the other location.
- **Export to Google Calendar** \- If checked, Achieve Planner appointments are exported to Google Calendar. Otherwise, Achieve Planner appointments are NOT exported.
- **Export Project Blocks** \- If checked, project blocks (appointments linked to a project or task) are exported to Google Calendar during the export. Otherwise, project blocks are NOT exported.
- **Re-establish Links Between Items** \- If checked, attempts to re-establish links between existing Achieve Planner and Google Calendar items during the next sync (based on the subject and start/end times).
- **Warn Before Deleting Items** \- If checked, Achieve Planner will warn you before deleting items in Achieve Planner and/or Google Calendar.
- **Save Google account password in Achieve Planner data file** \- If checked, AP will save your Google password as part of the data file. Make sure your AP data file password is strong and secure, otherwise your Google account password could be compromised.
  If conflicting changes are detected (changes found in both Achieve Planner appointment and corresponding Google Calendar event since the last sync), you can determine how to conflict will be resolved:
- **Using Achieve Planner Data** \- Always give Achieve Planner data preference to resolve conflicts (Google Calendar change is overwritten)
- **Using Google Calendar Data** \- Always give Google Calendar data preference to resolve conflicts (Achieve Planner change is overwritten)
- **Using Latest Data** \- Use the item with the latest modified date/time to resolve the conflict (the other changes will be lost)
  By default, the sync will only cover a time period starting 2 weeks prior to today's date and forward for a year (365 days). You can check the **Start Sync From** box and provide a date if you want to override this setting.
  Check the **Log Sync** box to create a log file during the sync for debugging purposes.
  **Clear Sync History** allows you to delete any existing sync history data in your Achieve Planner file. This is useful if you want to start a fresh sync with a different Google Calendar. NOTE: Be very careful with this because it could result in duplicated entries or inconsistent data.
  **Enabling Two Way Sync With\****Google Calendar**
  **NOTE: By default, Achieve Planner performs a ONE WAY sync, only importing data from Google Calendar into Achieve Planner.**
  However, you can easily modify the settings to perform a **TWO WAY** sync of appointment and event data, so that changes are synced to and from Achieve Planner and Google Calendar.
  To enable two-way sync, check both the**Import From Google Calendar __** and**Export to Google Calendar** boxes in the settings.
  **Syncing To a Non-Default Calendar In Your Google Account**
  Google Calendar supports having multiple calendars in your Google account ([Learn More](http://www.google.com/support/calendar/bin/answer.py?answer=37096))
  Syncing your Achieve Planner data to a non-default calendar in your Google account may provide some benefits including:
- You can easily delete the calendar without affecting your other calendars
- You can control sharing/visibility of your sync Google calendar separately from your other calendars
- You can decide when to view or exclude your sync Google calendar separately from your other calendars
  If you want to create a new Google calendar for the Achieve Planner sync, please consult the Google calendar documentation on [ creating a new Google calendar](http://www.google.com/support/calendar/bin/answer.py?hl=en&answer=37095).
  These instructions assume that you already have a separate (non-default) calendar in your Google account that you want to use for sync purposes.
  To set the non-default calendar that you want to sync with during the Google Calendar sync operation:

1. Login to your Google Calendar account and view the calendar
2. In the calendar list on the left, click the down-arrow button next to the appropriate calendar, then select Calendar Settings.
3. Find the Calendar ID in the Google Calendar Settings see red box in image below (part of the Calendar Address group)
   Copy the Calendar ID value and paste it into the Calendar ID textbox in the Google Calendar Sync dialog (see above). Don't include the "(Calendar ID:" portion or the closing ")"
   NOTE: If you've already performed a Google Calendar Sync with a different Calendar ID (or with the default calendar), then changing the Calendar ID value can result in duplications or deleted appointments because Achieve Planner won't be able to find the corresponding item in the new calendar, so it may think that you deleted them in Google Calendar.
   If you want to do a fresh sync with this new Google Calendar, then use the **Clear Sync History** button to clear any existing information from previous syncs.
   **Time Zone Limitations During Google Calendar Sync**
   Achieve Planner's calendar has some important limitations when it comes to the handling of different Time Zones. It's very important that you keep this in mind while traveling or changing time zones in Google Calendar.
   Achieve Planner does NOT keep track of time zone information while creating, modifying, importing or exporting appointments or events. Therefore all appointments and events are assumed to be "floating" and are NOT adjusted while traveling from one time zone to another (even if you change your current time zone in Windows or Google Calendar).
   Google Calendar DOES support changing time zones and having different calendars with different time zones.
   Because of this, syncing with Google Calendar with different time zone settings could cause appointments to be shifted to a different time within Achieve Planner.
   Here's what you need to be aware of:
4. I highly recommend that you [sync with a non-default calendar](#NonDefaultCalendar) if you travel and/or plan to change the default time zone in Google Calendar. Achieve Planner will use the time zone settings **of the calendar it syncs with** , even if its time zone is different from your default time zone settings.
5. Achieve Planner assumes the time zone of the Google Calendar you are syncing with for all appointment imports/exports.
   This is the case even if your current or local time zone (set in Windows) is different from the one set in Google Calendar.
6. Be VERY careful when creating recurring appointments in Google Calendar when traveling if you change the default time zone.
   By default, Google Calendar uses the current time zone settings in recurring appointments WHEN they are created. So you need to be VERY careful when creating recurring appointments if you are using a different time zone than the one in your sync calendar.
   Make sure you EXPLICITLY set the time zone information to match your sync calendar time zone when you are creating a recurring appointment while traveling in a different time zone.
   You can edit the time zone settings for recurring appointments from the Event Details form in Google Calendar.
