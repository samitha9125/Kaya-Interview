CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`conversation_id` text,
	`actor` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`model` text,
	`prompt_version` text
);
--> statement-breakpoint
CREATE INDEX `audit_events_correlation_idx` ON `audit_events` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `audit_events_conversation_idx` ON `audit_events` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
