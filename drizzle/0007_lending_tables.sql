CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`amount_lkr` integer NOT NULL,
	`term_months` integer NOT NULL,
	`given_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consents_customer_idx` ON `consents` (`customer_id`);--> statement-breakpoint
CREATE TABLE `loan_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`amount_lkr` integer NOT NULL,
	`term_months` integer NOT NULL,
	`officer_decision` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `loan_assessments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_applications_assessment_id_unique` ON `loan_applications` (`assessment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `loan_applications_one_open_idx` ON `loan_applications` (`customer_id`) WHERE "loan_applications"."officer_decision" IS NOT 'declined';--> statement-breakpoint
CREATE TABLE `loan_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`consent_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`amount_lkr` integer NOT NULL,
	`term_months` integer NOT NULL,
	`outcome` text NOT NULL,
	`ineligible_reason` text,
	`referral_reason` text,
	`provisional_outcome` text,
	`confidence_bp` integer,
	`threshold_bp` integer NOT NULL,
	`score_fetched_at` integer NOT NULL,
	`score_stale` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`consent_id`) REFERENCES `consents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_assessments_consent_id_unique` ON `loan_assessments` (`consent_id`);--> statement-breakpoint
CREATE INDEX `loan_assessments_customer_idx` ON `loan_assessments` (`customer_id`);