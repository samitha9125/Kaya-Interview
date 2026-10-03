CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`guest_session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversations_customer_idx` ON `conversations` (`customer_id`);--> statement-breakpoint
CREATE INDEX `conversations_guest_session_idx` ON `conversations` (`guest_session_id`);