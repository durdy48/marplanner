-- Third delta after the squashed baseline: a recurring meal can be left out of a single date's
-- menu (the household swaps it for something else that day) without touching the weekly plan.
-- One row per (entry, date); deleting the entry deletes its skips.
CREATE TABLE `meal_entry_skips` (
	`entry_id` text NOT NULL,
	`skip_date` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `skip_date`),
	FOREIGN KEY (`entry_id`) REFERENCES `meal_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
