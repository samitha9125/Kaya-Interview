CREATE TABLE `callback_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`reason` text NOT NULL,
	`customer_id` text,
	`contact_encrypted` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `callback_requests_conversation_reason_idx` ON `callback_requests` (`conversation_id`,`reason`);