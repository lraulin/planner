---
source_url: "http://www.effexis.com/achieve/features/automatic-backup.htm"
title: "Achieve Planner's Automatic Backup Feature"
scraped_at: 2026-08-03T15:15:05Z
---

# Achieve Planner's Automatic Backup Feature

_Archived from [http://www.effexis.com/achieve/features/automatic-backup.htm](http://www.effexis.com/achieve/features/automatic-backup.htm)_

---

# Automatic Backup

The automatic backup feature in Achieve Planner creates backup copies of your data file every time you save it. It helps you recover your data in case of accidental deletion or corruption of your main data file.
NOTE: Most likely, the automatic backup feature will NOT help you if you experience a hard drive crash or failure. You should backup your data files regularly to external media (Zip/CD-ROM/tape/external hard drive) as part of your regular backup process.
**How it works?** By default, the automatic backup feature creates a backup directory in the same location as your data file. If your data file is named "MyDataFile", the backup directory is named "MyDataFileBackup."
Two types of backup files are created: daily rotation and dated.
Every time you save your data file, a new backup copy is created. The files are of the form:
YYYYMMDD_FileNameBackup.ach (Dated)
FileNameBackup_N.ach (Rotation)
Where FileName is the name of your data file. Dated files are created for each day, while multiple rotation files are used every time you save the data file. You can use these in case you need to restore to a file saved previously during the day.
When the daily rotation maximum value is reached, the older daily rotation backup files are overwritten with newer files.
The first time you save your data file in 1.1.10, you will see a dialog specifying the default backup storage location for your data file. Then you will be asked if you would like to perform automatic backups to this location.
Select Yes to perform automatic backups, no to disable them.
**Automatic Backup Settings**
The automatic backup settings are available from the Options dialog (Tools->Options...)
Property Description
Enable Auto-Backup Check to enable, uncheck to disable auto-backup
Backup Path Specifies the directory where backup copies are stored. Leave blank to use default directory (based on data file location)
Warn every XX entries You will receive a warning when the number of backup files reaches a multiple of this number
Daily rotation Number of files to use for daily rotation backups
The auto-backup feature is enabled by default in 1.1.10 and future releases.
