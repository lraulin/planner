---
source_url: "http://www.effexis.com/achieve/online_documentation/usinggrids.htm"
title: "Achieve Time Management & Goal Setting Software Help - Using Grids"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Time Management & Goal Setting Software Help - Using Grids

_Archived from [http://www.effexis.com/achieve/online_documentation/usinggrids.htm](http://www.effexis.com/achieve/online_documentation/usinggrids.htm)_

---

Grids are used to display, edit and insert tabular information into Achieve.
The figure below show the Projects grid with some sample Projects:
At the top of the grid is a Help Tip which is provided by default for all top-level views (grid must have focus). You can turn it off using the **Show Help Tips** menu command in the [Help menu](helpmenu.md).
A grid contains a number of rows and columns. The intersection of a row/column is called a cell. The active cell is highlighted and contains the focus rectangle (dotted line). The grid must have the focus in order for the active cell to be highlighted.
Below you can find more information on the following common grid related tasks:
· [Inserting new rows](usinggrids.md#insertingnewrows)
· [Moving the active cell](usinggrids.md#movingtheactivecell)
· [Editing cell values](usinggrids.md#editingcellvalues)
· [Opening the active row](usinggrids.md#openingtheactiverow)
· [Deleting rows](usinggrids.md#deletingrows)
· [Changing parent/child](usinggrids.md#changingparentchild)
· [Copying rows](usinggrids.md#copyingrows)
· [Grouping](usinggrids.md#grouping)
· [Outline levels](usinggrids.md#outlinelevels)
· [Rearranging columns](usinggrids.md#rearangingcolumns)
**Inserting New Rows****

****To insert new rows into the grid you can use the _Insert_ key in your keyboard or the appropriate menu command (e.g., **Insert Insert After**) in the Insert menu. _Note: the grid must have the focus in order to use the keyboard shortcuts for the insert commands._
Some of the items in Achieve like Projects, Tasks and Goals support prioritization (see [Using Priorities](usingpriorities.md)) while others like File Items, Notes and Contacts do not. Items that support prioritization are sorted based on their priority value (A1 before A2 and so on).
For grids supporting ordering, you can use the **Insert Before** (_Shift+Insert_) and **Insert After** (_Insert_) commands to insert the new row into the grid before/after the active row and automatically shift the priority of the other items.
Some of the items in Achieve also support a tree-like hierarchy of items (parent/child). In these grids you can insert a new row as a child of the active row using the **Insert as Child** (_Ctrl+Insert_) command. For example, the "Database Search Feature" project is a child of the "Release 2.0 Planning" project. You can also use the **Insert at Top-Level** (_Ctrl+Shift+Insert_) command to insert a new top-level row (with no parents).
When you insert a row through any of the means described above, the grid will enter Insertion mode and provide a blank row where you can enter your data. Pressing the _Enter_ key while in insertion mode will commit the current row and add a new row immediately after the current one.
When a blank row has been added to the grid you can cancel the insert by pressing the _Esc_ key which will remove the blank row and return the grid to normal mode. Once you change any cell in the new row you can no longer cancel the insert using the _Esc_ key, but you can use the **Edit Delete** command to delete the row.
**Moving the Active Cell****

****The active cell is either in edit mode (when you are actively editing cell contents) or in selected mode (highlighted).
When a cell is in selected mode, you can move the active cell in various directions using the cursor keys (_left, right, top, bottom, page up, page down_). You can also press the _Home_ and _End_ keys to move to the first/last cell in the row. The _Tab_ key will move to the next cell and advance to the first cell of the next row when the last cell is reached, while _Shift+Tab_ will move to the previous cell.
For grids supporting parent/child relationships (like projects and tasks), you can move to the parent row by pressing the _Ctrl+Left_ keys (cell must not be in edit mode in order to move to parent row.) For example, in the grid above, pressing _Ctrl+Left_ while on the "Database Search Feature" cell would move the active cell to the "Release 2.0 Planning" cell. Pressing the _Left_ key while the focus is on the leftmost cell in a row will also select the parent row.
When a cell is in edit mode, the cursor keys are used by the cell's editor to move the caret. You can still move the active cell by using the _Alt+Cursor Key_ combination to exit edit mode and move to an adjacent cell. You can also use the _Tab_ key to move to the next cell and the _Enter_ key to move to the cell below the current cell.
You can use Ctrl+Home to move to the first cell in the grid, and Ctrl+End to move to the last cell in the grid.
Pressing the _Shift_ key while moving the active cell using the cursor keys will select multiple cells (both columns and rows).
As you move the active cell, the Status Bar displays a brief description of the current column in the grid.
**Editing Cell Values****

****To edit a cell's value the cell needs to be in edit mode. You can enter edit mode in the following ways:
· Press F2 to enter or exit edit mode for the active cell
· Click on a cell using the mouse
· Start typing (if the cell accepts alphanumeric input) which will replace any existing value in the cell
In addition, some types of cells have shortcuts for setting their values:
· For cells with a dropdown (dates, lists) you can drop/raise the dropdown using the _F4_ key (and _Spacebar_ key for lists)
· For cells with a checkbox, you can press the _Spacebar_ key to toggle the checked state of the combo without entering edit mode
Pressing the _Esc_ key while in edit mode will cancel the edit operation and restore the original cell value.
**Opening the Active Row****

****You can usually obtain a window with more details for the active row by doing one of the following:
· Double-clicking on a row
· Pressing _Ctrl+Enter_ key combination
· For top-level grids, you can invoke the **File Open Open Selected Items...** command from the file menu
**Deleting Rows****

****Rows can be deleted using the**Edit Delete** command (Edit menu) which deletes all rows with selected cells (or the active row if there are no other selected rows). Be aware that deleting a row will automatically delete all the children rows as well.
In most cases, you can undo a row deletion using the **Edit Undo** command.
**Changing Parent/Child****

****For grids supporting parent/child hierarchies, you can arrange rows in several ways:
**Drag & Drop

You can drag one or more selected rows through their selector (small square at the start of the row) and drop them on a target row. As you drag the rows, the target row will be indicated using red arrows. Depending on the position of the mouse relative to the target row, the drop arrows will either be placed above, center and slightly to the right, or below the target row. To drop a set of rows as a child of the target row, simply drop the rows when the drop arrows are centered and to the right (indicating a child drop) of the desired target row.
To drag and drop multiple rows, the entire row must be selected by clicking on the selector (hold _Ctrl_ key while clicking on the selector to make multiple selections).
**Using Pickup & Drop Commands

The**Pickup Row(s)** command in the Edit menu will "pickup" all the rows with selected cells. You can tell which rows are picked up because their selector becomes highlighted.
Once you have one or more rows picked up, you can use the drop commands to drop them on the active row (containing active cell):
**Edit Drop at Same Level** \- Drop picked up rows at the same level as the target row and reprioritize rows
**Edit Drop as Child** \- Drop picked up rows as children of the target row
The **Actions Move Outdent** command can be used to outdent all the rows with selected cells. Outdenting a row moves it to the same level as its current parent.
The expansion indicator associated with each parent row can be used to expand/collapse the view of the children. You can toggle the expansion state of the active cell using the _Spacebar_ key when the cell is not in edit mode (move the cell to the parent row cell with the expansion indicator and press _Spacebar_). You can also use commands in the Outline menu (see [Actions menu](actionsmenu.md)) to change the outline level.
**Copying Rows****

****You can copy one or more rows using one of the following methods:
****·**** **Drag & Drop** \- While dragging one or more rows, press the _Ctrl_ key to drop copies onto the target row. Note that copying a parent row will automatically copy all of its children.
****·**** **Pickup and Drop Commands** \- You can use the **Edit Drop Copy at Same Level** and **Drop Copy as Child** commands to drop copies of picked up rows onto the target row.
**Grouping****

****Some of the grids in Achieve support grouping the information by one or more values. For example, when the "All Result Areas" value is selected from the Result Areas dropdown in the Projects View, the project list is grouped by Result Area. You can collapse/expand individual groups using the expansion button (+/-) or with the keyboard (left to collapse, right to expand).
The **Actions Group Expand All Groups** and **Collapse All Groups** commands can be used to expand or collapse all the groups simultaneously.
**Outline Levels**
For grids supporting parent/child hierarchies, you can expand/collapse individual rows using the expansion button (+/-) for the row. You can also press the _Spacebar_ key to toggle the expansion/collapse of the row when the cell with the expansion button is the active cell.
The **Actions Outline** menu contains several commands you can use to expand all the children of a row or expand/collapse all the rows to a certain outline level.
**Rearranging Columns**
You can change the size and positions of the columns in the grid using the mouse.
To change the position of a column, you simply drag it by the column header (you must select it first and then drag it once selected) and drop it in its new location.
To change the size of a column you click between the two headers (after the cursor has changed to a resize shape) and drag to the new size.
In the current version of Achieve, the changes to the position or size of columns will not be retained once the window is closed. This feature is planned for a future release.
See Also
[Using Achieve](usingachieve.md) [Using Priorities](usingpriorities.md) [Main Menu](mainmenu.md) [Actions Menu](actionsmenu.md)

Copyright (c) 2004-2007 by [Effexis Software, LLC](../../index.md). All rights reserved.
Spending too much time drawing sequence diagrams? Try our [Sequence Diagram Tool](http://www.sequencediagrameditor.com)
[Other resources](../../links.md)
See also [Time management](http://www.timethoughts.com/time-management.htm) and [personal goal setting](http://www.timethoughts.com/goal-setting.htm) guides to make better use of your time and learn how to set and achieve your important goals.
[Time management software](../planner.md) : [daily planner](http://www.timethoughts.com/timemanagement/daily-planner.htm) : [goal setting software](http://www.timethoughts.com/goalsetting/goal-setting-software.htm) : [definition of time management](http://www.timethoughts.com/timemanagement/definition-time-management.htm)
