---
source_url: "http://www.effexis.com/achieve/online_documentation/taskchoosersettings.htm"
title: "Achieve Time Management & Goal Setting Software Help - Task Chooser Settings"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Task Chooser Settings

_Archived from [http://www.effexis.com/achieve/online_documentation/taskchoosersettings.htm](http://www.effexis.com/achieve/online_documentation/taskchoosersettings.htm)_

---

The task chooser settings are set on a per view basis (each task chooser view has its own independent set of settings.)
**Entry Scoring Settings

****The entry scoring settings control the amount of points awarded to each item based on its properties. The greater the value, the greater the number of points contributed toward the score.
**Priority** \- This value is multiplied directly with the item's priority multiplier to determine the score. It awards points based only on the item's priority. Increasing this value will give a higher score to items with a higher priority.
**Project** \- This value is multiplied with the item's project priority multiplier (which only takes into account project level priority values without including the tasks.) Increasing this value will give a greater emphasis to the project priority values.
**Overdue** \- A bonus that is multiplied with the item's priority multiplier only for items that are overdue (due to their schedule status)
**Start Date** \- A bonus that is multiplied with the item's priority multiplier. The bonus amount is increased/decreased based on the target start date of the item relative to today's date. If the item's start date is in the future, the bonus becomes negative and penalizes the score with a bigger penalty the farther away the start date. If the start date is in the past, the bonus is positive and increases the score.
This has the effect of decreasing the score of items with a start date in the future (because they are not scheduled to start yet), and increasing the score of items that should/have been started already.
You can change the start date bonus value to increase/decrease the start date's contribution to the item's overall score. Setting it to 0 will remove any start date contribution.
NOTE: The future start date penalty is not applied to overdue items or items with a deadline occurring before their target end date or target start date.
**End Date** \- A bonus that is multiplied with the item's priority multiplier. The bonus amount increases the closer Today's date gets to the target end date.
You can change the end date bonus value to increase/decrease the end date's contribution to the item's overall score. Setting it to 0 will remove any end date contribution.
NOTE: The end date bonus is not applied to items with a deadline occurring less than 20 days in the future.
**Deadline** \- A bonus that is multiplied with the item's priority multiplier. The bonus amount increases the closer Today's date gets to the item's deadline. Items without a deadline do not receive a deadline bonus contribution.
You can change the deadline bonus value to increase/decrease the deadline's contribution to the item's overall score. Setting it to 0 will remove any deadline contribution.
**Apply Priority Multiplier to Date Bonus** \- This setting controls whether the priority multiplier is applied to the date bonus or not. If you want the date bonus to be higher for important items, then you should check this box. On the other hand, if you want the date bonus to apply equally to all items regardless of their priority, you should leave these item unchecked. The default value is unchecked, since deadlines apply equally to all items.
See [Task Chooser Advanced Scoring Settings](taskchooseradvancedscoring.md) for a description of the advanced settings that control the conversion of priority values to a priority multiplier for each item.
**Filtering Settings

****The filtering settings control how the item list is filtered for the current view (date filtering is an independent control available directly through the[task chooser tab](taskchooser.md))
**Max Entries**
The default number of entries to show in the item list
**Result Area Category**
Filter the item list based on the result area category (personal vs. work) for each item
**Use Project Blocks**
When checked, the project/task blocks in the weekly schedule are used to filter the display based on the current time.
**Fit in current project block**
When checked, the item list is also filtered based on the effort left value of the items. Only items that fit in the current block (based on the current time) are shown
**Override with Overdue Items**
When checked, overdue items are also shown in the list even if they don't belong to the current project block
**Override with Items Behind Schedule**
When checked, behind schedule items are also shown in the list even if they don't belong to the current project block
**Hide D Priority Items**
When checked, items with a priority of D (or an ancestor with a D priority) are not included in the list
**Include Projects in List**
When checked, projects that have no active children are also included in the list. Uncheck to prevent projects from being displayed
**Only items with deadlines**
When checked, only items that have deadlines are shown in the list
See Also
[Task Chooser](taskchooser.md) [Advanced Task Chooser Settings](taskchooseradvancedscoring.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
