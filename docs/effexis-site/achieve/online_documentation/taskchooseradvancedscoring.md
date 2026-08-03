---
source_url: "http://www.effexis.com/achieve/online_documentation/taskchooseradvancedscoring.htm"
title: "Achieve Time Management & Goal Setting Software Help - Task Chooser Advanced Scoring Settings"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Task Chooser Advanced Scoring Settings

_Archived from [http://www.effexis.com/achieve/online_documentation/taskchooseradvancedscoring.htm](http://www.effexis.com/achieve/online_documentation/taskchooseradvancedscoring.htm)_

---

****The Advanced Scoring settings are available by clicking the _Advanced..._**\__** button in the entry scoring section. These settings allow you to control how the priority values (A/B/C/D) and result area importance are used to determine the overall priority multiplier for the item.
**Priority Settings**
The A's, B's, C's, D's and None settings can range from 0.0 to 1.0, and control how the priority range is converted into a numeric value. The None setting is applied to items that are unprioritized (don't have a priority value,) which is why this value should be set to 1.0 by default.
For example, if the A's value is 1.0 and the B's value is 0.4, that means that a priority value of A1 will have a priority multiplier of 1.0 and a priority value of B1 will have a priority multiplier of 0.4.
The **Unranked** setting (0 to 1) determines the priority multiplier value for unraked priority values (multiply the unraked value with the corresponding category value.)
For example if the Unraked setting is 0.95, an unranked A priority will have a multiplier of 0.95 (1.0 * 0.95), and an unranked B will have a multiplier of 0.38 (0.4 * 0.95).
The range settings (**Task Rank Range, Project Rank Range,** and **Result Area Importance Range**) control how the priority ranks affect the multiplier.
The priority ranks range from 1 to 2499, plus the unranked value for a total of 2500 values in each category.
The difference between consecutive priority ranks (for example, from A1 to A2) is based on the range value divided by 2500. For example, if the task range value is set to 2.5, the difference between A1 and A2 multipliers would be 0.001 (2.5 / 2500).
The greater the range value, the bigger the difference between consecutive rank multiplier values.
For result area importance, the concept is similar except that the result area importance (which ranges from 0 to 100) is used instead.
**Result Area Contributions to Priority Multiplier

****By default, the Result Area Importance is used to determine how much the parent result area(s) contribute to the overall priority multiplier based on the importance and the result area importance range.
The **Use Result Area Priority in Multiplier** checkbox can be used to determine if the result area priority value (checked) or the importance (unchecked) should be used when determining the priority multiplier value.
If the result area priority is being used in place of the importance (checkbox is checked), then the **project rank range** value is used to determine the difference between consecutive priority ranks, and the Result Area Importance Range setting is ignored.
See Also
[Task Chooser Settings](taskchoosersettings.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
