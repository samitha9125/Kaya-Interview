-- SQLite can't add a NOT NULL column without a default, so the table is
-- rebuilt. Conversations started before Settings existed used the defaults.
CREATE TABLE `__new_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`guest_session_id` text,
	`models` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_conversations` (`id`, `customer_id`, `guest_session_id`, `models`, `created_at`)
SELECT `id`, `customer_id`, `guest_session_id`, '{"triage":"google/gemini-3.1-flash-lite","loan":"z-ai/glm-5.3-flash","kyc":"openai/gpt-5.6-luna"}', `created_at` FROM `conversations`;
--> statement-breakpoint
DROP TABLE `conversations`;
--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;
--> statement-breakpoint
CREATE INDEX `conversations_customer_idx` ON `conversations` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `conversations_guest_session_idx` ON `conversations` (`guest_session_id`);
