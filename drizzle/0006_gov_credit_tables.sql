CREATE TABLE `credit_score_cache` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`score` integer,
	`has_history` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`score_changed` integer
);
--> statement-breakpoint
CREATE TABLE `gov_api_budget` (
	`id` integer PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`attempts` integer NOT NULL,
	`blocked_until` integer,
	`cool_down_until` integer
);
