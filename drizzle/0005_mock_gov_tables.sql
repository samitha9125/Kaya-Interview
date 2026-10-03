CREATE TABLE `mock_gov_citizens` (
	`nic_hash` text PRIMARY KEY NOT NULL,
	`score` integer
);
--> statement-breakpoint
CREATE TABLE `mock_gov_ip_calls` (
	`ip` text NOT NULL,
	`day` text NOT NULL,
	`calls` integer NOT NULL,
	PRIMARY KEY(`ip`, `day`)
);
--> statement-breakpoint
CREATE TABLE `mock_gov_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`failure_mode` text NOT NULL
);
