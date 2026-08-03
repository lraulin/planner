---
source_url: "http://www.effexis.com/achieve/training/email-management.htm"
title: "Outlook Email Management and AP"
scraped_at: 2026-08-03T15:15:05Z
---

# Outlook Email Management and AP

_Archived from [http://www.effexis.com/achieve/training/email-management.htm](http://www.effexis.com/achieve/training/email-management.htm)_

---

# Outlook Email Management

In this tutorial, we are going to look at Outlook email management from within Achieve Planner.
There are two ways to import email messages from Outlook to Achieve Planner.
NOTE: The screenshots and features described in this tutorial are based on Achieve Planner 1.9.2 or later. Earlier versions may not match.
**Method # 1 - Use A 'To-Do' Folder**
With this method, you designate one or more Outlook email folders as 'Email Import Folders.'
Then, every time you do an Outlook Synchronization, AP will look in these Email Import Folders and convert any new emails into AP tasks (linked to the original email.)
The new task are stored under the AP <New Email Tasks> project so that you can process them using the New Task Organizer wizard (in the Tools menu).
Let's take a look at the steps:
**Step 1** \- Designate your email import folder(s) in Outlook.
The first step is to tell AP about your email import folders in Outlook. You do this using the Outlook Synchronization settings dialog box.
1.1 Use Tools -> Outlook Synchronization to bring up the synchronization dialog
1.2 Click on the Settings button to open the Settings dialog
1.3 Check the 'Import Email from the following folders' box (this tells AP that you want to use Method # 1 to import emails from Outlook)
1.4 Click on the Browse button to select a folder in Outlook
That's it. Every time you sync, AP will import emails from these folder(s).
NOTE: AP will not create these folders for you, you need to create them in Outlook yourself before you can tell Achieve Planner about them.
**Method # 2 - Use The Email Import Hot Key**
The 2nd method for importing emails is to use the email import hot key. You can define the hot key in the Outlook Synchronization dialog.
Here are the steps to import emails using the hot key:
2.1 Select the email that you want to import in Outlook
2.2 Activate the Hot Key (default is Win+Alt+E)
The email should then be imported into AP as a task. The new task is placed in the <New Email Tasks> project so you can process it later using the New Task Organizer tool (Tools -> New Task Organizer Wizard menu item)
2.3 Optionally, you can move the email into your Todo folder (similar to method # 1) so that you can track it better.
**Mix and Match Methods**
You can mix and match the two email import methods. Both of them work the same way. The main difference is that emails that are stored in an Import Folder are also updated during the Outlook sync based on the status of the associated Achieve Planner task (see below.)
Emails that are imported using the Hot Key and that are not stored in an import folder are NOT updated by AP.
**Viewing Emails Associated with AP Tasks**
Achieve Planner tasks that are linked with an Outlook email have an email icon in the Name column of the grid to notify you of the association.
To view the email associated with the Task, you can use the Actions -> View Email menu item (in Achieve Planner.) Achieve Planner will ask you whether to view the email itself, or the folder containing the email.
NOTE: In some cases, Outlook may be unable to show the folder containing the email, especially if you use a 3rd party tool to move the email from one folder to another.
**Updating "Processed" Emails**
During an Outlook Synchronization operation, Achieve Planner updates emails in the email import folders (specified in the Outlook settings) based on the status of the associated Tasks.
If the Task associated with the email is completed, Achieve Planner will do one of the following:
**1) Move Email to Processed Folder**
If you've specified a 'Processed Email Folder' in the Outlook Settings, Achieve Planner will move the email from the import folder to the processed folder.
**2) Change the 'Flag Status' field of the email to Completed**
If you do not specify a 'Processed Email Folder', Achieve Planner will set the Flag Status of the email to Completed.
NOTE: Due to backward compatibility issues with earlier versions of Outlook, Achieve Planner will NOT change the flag icon of the email. If the flag icon is set (to a colored flag for example), then it WILL NOT change to completed.
To get around this, you can add the Flag Status field to the email view in Outlook so you can see which emails are marked as completed in the import folder.
**Importing Emails From Multiple Email Folders**
Achieve Planner supports importing emails from multiple email folders. You can do this by separating the folders with a ; in the Outlook Settings dialog.
Additionally, you can prefix the folder path with a P or a W to designate the folder as a Postponed (P) or a Waiting For (W) folder. This is optional and not required.
Here is an example:
**Related Lessons**

- [Working with Contexts, Filters and the Task Chooser](structured-vs-unstructured.md)
- [Planning Your Work With Achieve Planner](../tour/plan-your-work.md)
- [Working Your Plan With Achieve Planner](../tour/work-your-plan.md)
- [Generating a 'Next Action List' using Achieve Planner](../next-action-list.md)
- Advanced Task Chooser filtering (Coming Soon)
