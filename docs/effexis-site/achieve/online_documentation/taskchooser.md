---
source_url: "http://www.effexis.com/achieve/online_documentation/taskchooser.htm"
title: "Achieve Time Management & Goal Setting Software Help - Task Chooser"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Task Chooser

_Archived from [http://www.effexis.com/achieve/online_documentation/taskchooser.htm](http://www.effexis.com/achieve/online_documentation/taskchooser.htm)_

---

**Overview

The **task chooser** tab (available from the Go menu) allows you to view a selection of projects/tasks across all your projects to help you choose what to work on next. It helps you answer "what is the most valuable use of my time right now?"
The task chooser uses a **scoring formula** to give each project and task a numeric value that determines the order of the tasks in the list. The task chooser also applies several filters to determine whether to include a particular project/task in the list.
The task chooser provides various **views** that control the **settings** used to select the task chooser list. The settings determine the scoring and filtering options for the given view.
The selection bar at the top of the tab allows you to select the current view, change the settings for the current view, control the number of items displayed in the list (show more/show less,) and to perform date based filtering of the items.
The selection bar also displays the project associated with the current selected item.
The grid displays the items in the list **sorted by their score** , which is determined based on the settings and the information in each item (see scoring formula section below.)
Below the grid, the **Parent's Docking Panel** displays the parents of the selected item in the hierarchy.
**Double-clicking** on an row item in the task chooser (or pressing Ctrl+Enter) will navigate to the item's row in the corresponding project or task list.
If you would like to open the information form associated with the item (Task Information/Project Information), use the _File- >Open->Open Selected Item(s)_ command (Ctrl+O).
**Scoring Formula

****The task chooser scoring formula uses the priority value of each item (and all its ancestors) to determine the importance of the item. The importance value is a number between 0 and 1 and is called the importance or priority multiplier.
To compute the priority multiplier, each priority value in the item's outline hierarchy is converted into a number between 0 and 1 (based on the A/B/C/D category as well as the rank) using the current view's priority weight settings. The value is then adjusted based on the depth of the item in the outline. The deeper the item, the less its priority affects the overall importance multiplier.
For result areas in the outline, the result area importance is used as the priority value.
All the priority values for the item and its ancestors are then multiplied together (taking into account the item's depth in the outline) to determine the overall priority multiplier.
Each item is awarded a number of points for properties like priority, item status (overdue/behind schedule, etc.), how close the item is to its deadline or end date, and the target start date. These points are then added together to obtain the total number of points for the item. The settings for each task chooser view control the number of points awarded for each of the item's properties (see Task Chooser Settings.)
The score of the item is the product of the priority multiplier and the total points. Both the points and the overall importance of the item are used to determine the score.
Items in the chooser grid are then sorted according to the overall score of each item.
_Note: You can add a column to the task chooser grid to show you the score/multiplier associated with each item using the View- >Customize Current View.. command.

__Note: When date based properties (like start date, end date, or deadline) contribute to the item score values, you may get unexpected results in the task chooser for new items that have not been scheduled (and therefore don't have any date settings). You can use the Actions- >Reschedule command to update the scheduling dates of the projects/tasks, or set the relevant date scoring settings to 0 if you don't want to use them._

__**Item Filtering

****In addition to the sorting of items in the list based on their individual scores, the task chooser also performs filtering of items to limit the number of items displayed.
The following factors are used for filtering in different views:
» Whether the item has active children
» The project associated with the item
» Whether the item is a project or a task
» The current project block in the weekly schedule (based on the current time)
» The amount of time remaining in the current project block (based on the current time)
» The result area category for the item
» The position of the item in the list (filter by number of items)
» The schedule status of the item (behind schedule/overdue)
» Whether the item is a D priority item or not
» Whether the item has a deadline or not
**How are items included in the list?

1. Only active (not completed) items are shown in the list.
2. If the list is filtered by result area category (personal vs. work), only items belonging to the selected category appear in the list.
3. If the list is filtered by current project/task block, only items belonging to the current project or task appear in the list. For task blocks, child task of the task in the block are also allowed to appear in the list.
   3a) You can choose to allow overdue and behind schedule items to override the project block filtering. If that is the case, the items will be shown in the list if they are overdue or behind schedule respectively. This is useful if you want to be aware of overdue items regardless of project or project block.
4. If the list is filtered to fit in the current project block, only items that can be worked on within the current block (based on effort left) appear in the list.
   For example, if the current project block has 45 minutes of time remaining, and the task list has items of 15 minutes, 2 hours, and 30 minutes ordered based on their score, only the 15 minute and 2 hour tasks are shown.
5. Only items that don't have children, or whose children are all completed are shown.
   An exception is made for tasks with incomplete "next action" reminders, in which case the parent task and all the reminders are shown in outline form.
   Note that this rule will also allow active projects to appear in the list if they have no tasks or sub-projects, or if all their children have been completed but the projects themselves have not been marked as completed. There is a filtering setting you can use to prevent projects from appearing in the list, even when all their tasks have been completed.
6. If the list is filtered to a certain number of items, any items over the limit that were not filtered by any of the previous rules will not be shown.
   The Show More/Show Less buttons in the task chooser extend the limits of the filtering to change the number of items shown.
   In general, show more will extend the "fit in project block" rule to allow more items in the current project block to be shown, as well as extending the total number of items shown. Show less has the opposite effect.
7. Date based filtering may further limit the number of items shown in the list based on their target start, target end, or deadline dates. See below for a description of each filtering value.
8. Other filtering restrictions may prevent certain items from showing in the task list (deadline only, no D priority items, no projects, etc.)
   **Date Based Filtering

****The main display provides a simple dropdown to filter the task list of the chooser based on date values. The following options are provided:
**None** \- No date filtering is performed

**Current** \- Only displays items that are ongoing (state is InProgress or ShouldDelegate), whose target start date is Today or in the past, or whose deadline (or ancestor deadline) is Today or in the past
**Overdue** \- Only displays items that are overdue based on earliest ancestor deadline (deadline is in the past)
**Behind Schedule** \- Only displays items that are overdue or whose target end date (if they have one) is in the past
**Due Soon** \- Only displays items whose deadline or target end date occurs before the next seven days (this also includes **Overdue** and **Behind Schedule** items)
**Next Seven Days** \- Displays items whose start date (if it has one), target end date, or deadline occur before the next seven days
**Next 14 Days** \- Displays items whose start date (if it has one), target end date, or deadline occur before the next 14 days
**Next 30 Days** \- Displays items whose start date (if it has one), target end date, or deadline occur before the next 30 days
See Also
[Task Chooser Settings](taskchoosersettings.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
