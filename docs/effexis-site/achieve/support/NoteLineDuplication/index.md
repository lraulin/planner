---
source_url: "http://www.effexis.com/achieve/support/NoteLineDuplication/index.htm"
title: "Achieve Planner Note Line Duplication"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Planner Note Line Duplication

_Archived from [http://www.effexis.com/achieve/support/NoteLineDuplication/index.htm](http://www.effexis.com/achieve/support/NoteLineDuplication/index.htm)_

---

Outlook Sync Note Blank Line Duplication
A problem in the Achieve Planner Outlook Task sync was discovered in Achieve Planner versions prior to 1.9.8 that could result in large notes containing many thousands of blank lines. These large notes could cause the Achieve Planner data file to grow too big and cause performance problems.
This problem was resolved in 1.9.8. If your data file was affected, it's likely that these extra blank lines are still present in your data file.
1.9.8 also includes a "cleanup" utility that you can use to automatically remove the extra (duplicated) blank lines from Notes in Projects, Tasks and Contacts when detected.
The cleanup utility runs by default when you first open your data file using 1.9.8 or when you run the first Outlook sync.
**How To Run The Cleanup Utility Manually**
You can run the cleanup utility manually at any time using these instructions:

1. Use Tools -> Outlook Synchronization menu item to open the Outlook Sync dialog
2. Press the F12 key while the dialog is active
3. Follow the on-screen instructions to run the cleanup utility
   **How To Find/Remove Large Notes From Outlook**
   The cleanup utility only works on the Achieve Planner data file. If you do an Outlook sync after cleaning up your data file, that should cleanup all the notes in the corresponding Outlook tasks.
   However, you may still have large notes in Outlook for tasks that are NOT synced with Achieve Planner. For example, completed tasks that you have in Outlook for archive purposes.
   You can find Tasks with large notes in Outlook as follows:
4. Go to the Task folder in Outlook
5. Right-click on the tasks list and select 'Customize Current View' from the context menu
6. Click on the Fields... button and select 'All Task Fields' from the "Select available fields from" dropdown.
7. Select the Size field from "Available Fields" and press the "Add ->" button to add it to the list.
   You can then sort by size and see if there are any tasks with 100's or KBs or MB's in size. These are tasks that probably have the Note space duplication issue.
   You can then manually delete the notes or delete the tasks themselves.
