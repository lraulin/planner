---
source_url: "http://www.effexis.com/achieve/support/removing-duplicate-appointments.htm"
title: "Removing Duplicated Appointments in Achieve Planner & Outlook"
scraped_at: 2026-08-03T15:15:05Z
---

# Removing Duplicated Appointments in Achieve Planner & Outlook

_Archived from [http://www.effexis.com/achieve/support/removing-duplicate-appointments.htm](http://www.effexis.com/achieve/support/removing-duplicate-appointments.htm)_

---

Removing Duplicated Appointments in Outlook Achieve Planner 1.6.1 has several enhancements that should reduce and hopefully eliminate the duplication of appointments during the Outlook sync.
This page describes several strategies for removing duplicated appointments from both Achieve Planner and Outlook.
Step # 1 - Removing duplicated appointments from Outlook
There are several tools available for removing duplicated appointments in Outlook. Some are free, others are not.
You can also remove the duplicates yourself using the "By Category" view of the Outlook calendar and grouping by subject.
You may want to backup your Outlook .pst file before removing the duplicates just in case.
NOTE: Effexis Software does not make, recommend, or otherwise endorse these tools. This list is provided AS-IS for your convenience only. We make no claims regarding the quality or effectiveness of these tools, please research and select the appropriate tool for your needs.
Free Outlook duplicate remover tool from Vaita:
[ _http://www.vaita.com/ODIR.asp_](http://www.vaita.com/ODIR.asp)
Duplicate remover tool from Sperry Software:
[ _http://www.sperrysoftware.com/Outlook/Duplicate-Appointments-Eliminator.asp_](http://www.sperrysoftware.com/Outlook/Duplicate-Appointments-Eliminator.asp)
Step # 2 - Removing duplicated appointments from Achieve Planner
Achieve Planner 1.6.1 has a new duplicate appointment removal feature that is part of the delete appointment range functionality.
You can access it from the Actions->Delete Appointment Range menu item in the Weekly Schedule tab.
Select the date range in which you want to remove duplicates **and make sure that the "Only delete duplicate entries"** **checkbox is checked!**
I recommend making a backup copy of your data file before doing this just in case.
Step # 3 - Clear Outlook Sync History for Appointments
Because it is impossible to tell which duplicates will be removed in AP and Outlook, you need to clear the Outlook sync history for appointments and re-establish the links between the AP and Outlook appointments.
To do that, start by clearing the Outlook sync history:
**Step 3.1** \- Go to Tools -> Outlook Synchronization...
**Step 3.2** \- Click on the Settings... button in the Outlook Synchronization dialog
**Step 3.3** \- Click on the 'Clear Sync History...' button in the settings dialog and confirm the warning.
**Step 3.4** \- Click OK to exit the settings dialog. A Clear Sync History dialog should appear. Make sure that only the Appointments checkbox is checked
Click OK and confirm the deletion of the sync history.
Step # 4 - Re-establish links with Outlook appointments
Now you need to re-establish the links between the Outlook and AP appointments.
**Step 4.1 -** Click on the "Settings..." button in the Outlook Synchronization dialog again, and check the box toward the bottom that says "Re-establish links to existing appointments and contacts (Next Sync Only)"
If you are doing Contact syncs, you may want to temporarily disable the import/export of contacts for this next sync only by clearing the Import/Export contact checkboxes.
Click OK to exit the Settings dialog.
**Step 4.2** \- Perform a regular sync to re-establish the appointment links
