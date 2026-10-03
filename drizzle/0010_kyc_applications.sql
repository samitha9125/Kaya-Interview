CREATE TABLE `kyc_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`status` text NOT NULL,
	`details_encrypted` text NOT NULL,
	`matches_existing_customer` integer NOT NULL,
	`created_at` integer NOT NULL,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE INDEX `kyc_applications_conversation_idx` ON `kyc_applications` (`conversation_id`);