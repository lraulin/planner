---
source_url: "http://www.effexis.com/achieve/online_documentation/options.htm"
title: "Achieve Time Management & Goal Setting Software Help - Options"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Options

_Archived from [http://www.effexis.com/achieve/online_documentation/options.htm](http://www.effexis.com/achieve/online_documentation/options.htm)_

---

The Options Dialog allows you to configure the following application options:
**General Tab**
Additional settings:
**Show Completed Items Last**
Indicates if views like "All Tasks" and "All Projects" should show completed items before/after active items
**Use full project path in task list**
Indicates if the Task List should show project names using their full path (including parent projects)
**Record work/expenses on project/task complete
Indicates whether to display the work/expense tracking dialog as projects/tasks are completed
**Auto-set reminder for projects/tasks with deadlines
If checked, the reminder for a project/task is automatically set when setting the deadline. Otherwise, the reminder needs to be set independently of the deadline.
**Quick task entry HotKey**
Specify the hotkey that you want to associate with the Quick Task Entry dialog (also available from the system tray icon context menu). Leave the box blank to clear any hotkeys.
**Save Tab

**_Automatic Backup Options

**\__**Refer to the[automatic backup topic](automaticbackupofdatafiles.md) for a description of the various settings.

**Automatically save items every xx minutes -** Check to enable auto-save of the data file at the specified interval.

**Display Tab**
**_Priority Colors

**\__**You can configure the colors that are used for the various priority values. The grid uses the colors to distinguish rows of different priority from each other.
**Use Lowest Ancestor Priority Coloring

****Check the box to use the lowest ancestor priority in the current view to color the items, or uncheck to color the item based only on its immediate priority.
If this box is checked, the priority value of the lowest ancestor is used, rather than just the immediate priority.
For example, if the priority of an items ancestors are: B->A->A, the item will be colored as a B even though its priority is A because it has a parent that is a B, which is a lower priority than A.
NOTE: the lowest ancestor priority coloring is more resource intensive than regular priority coloring.
**Use Office 2003 Visual Styles

****Check the box to use the enhanced "Office 2003" visual styles, uncheck to use the default vistual styles.
**Minimize to System Tray On Close

****If checked, the Achieve Planner application is minimized to the system tray when clicking the "X" button in the main form rather than closing the form. If unchecked, the "X" button closes the form.
**Fast Load Layout

****Select from the dropdown the layout that you would like to load by default when first opening the data file. Depending on system and memory configuration, loading a data file with a large numer of open tabs (like Outline, Projects, Tasks, Task Chooser, Notes, Goals, Weekly Schedule, etc.) could result in loading delays. The fast load layout configurations may significantly reduce the loading delays.
Select None to use standard loading where the same layout is loaded every time.
**Support Print In Color

****If checked, the grids will print in color when the printer supports it. If unchecked, the grids will print in black & white even if the printer supports colors. This affect the priority coloring of rows during printout.
**Grids Tab**
**Grid Screen/Print Font**
When checked, you can override the default font & font size used in the grids for screen display and printing.
**Grid Background Color**
Use this setting to override the grid background color. Clear the color (select the text and hit backspace) to restore to use a default color.
**Grid Row Contrast

****The setting determines the contrast level between the grid row text and the default grid row background color. Higher values mean a higher contrast.
**Outline Indentation Level

****The outline indentation level determines the amount of indent between outline levels in the grid, ranging from 1 (low) to 5 (high).
**Bolden Items with Children**
Indicates if items with children should be shown in bold (checked) or regular (unchecked) styles.
**Use Gradient Backgrounds (Office 2003 Only)**
When the Office 2003 visual styles are enabled, check the box to use gradient backgrounds for the grids, uncheck to use default. If a grid background color is selected, it overrides the gradient background.
**Scheduling Tab

****The scheduling tab controls aspects related to the project/task scheduling functionality of Achieve Planner.
**Perform Start/End Date Scheduling on Reschedule

****If this box is checked, Achieve Planner will perform start/end date scheduling of effort driven projects and tasks using the automated scheduling algorithm when you issue a Reschedule command (**Actions Reschedule**.)
If you uncheck this box, Achieve Planner will not perform automated scheduling of start/end dates, but instead will only update parent project/task date values based on the date values in the children. Note that Lead Time based scheduling occurs whether this box is checked or not.
**Always Perform Lead Time Based Scheduling for Projects/Tasks

****If checked, Achieve Planner will always use Lead Time based scheduling for all projects/tasks with deadlines to determine the Target Start Date of the project/task. This only occurs when the Reschedule command is issued even if the**Perform Start/End Date Scheduling on Reschedule** flag is turned off.
If unchecked, lead time based scheduling is only performed for non-effort driven projects and tasks upon a Reschedule operation.
**Calendar Tab

******_Calendar Start Time

**\__**When opening a data file, the weekly schedule scrolls down so that the earliest time displayed is the lesser of the current time or the calendar start time value (e.g., 8:00 am).
If the data file is opened later in the day, the calendar is scrolled so that the current time is in 33% down.
These settings are also used in the weekly and daily planning wizards to initialize the location of the schedule view.
**_Default Reminder_**
The default reminder setting controls whether new appointments have a reminder set by default (box is checked) or unset (box is unchecked.) If the box is checked, you can set the default time for the reminder in minutes.
**_Complete Associated Task when Appointment is Completed_**
This setting controls whether tasks associated with appointments (task blocks) are also completed when the associated appointment is marked completed in the weekly schedule. This only applies to tasks and not projects. Tasks are only completed when the appointment is completed through the weekly schedule, and not through the appointment information form.
The Confirm checkbox controls whether to display a confirmation dialog before completing the task (checked) or to automatically complete the task without confirmation (unchecked.)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
