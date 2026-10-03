CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_number` text NOT NULL,
	`full_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`nic_encrypted` text NOT NULL,
	`mobile_number` text NOT NULL,
	`monthly_income_lkr` integer,
	`monthly_repayments_lkr` integer,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_customer_number_unique` ON `customers` (`customer_number`);