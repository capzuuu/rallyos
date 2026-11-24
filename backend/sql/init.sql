-- RallyOS — Pickleball Game & Tournament Management Platform
-- Run this on your local MySQL server (localhost:3306) or let FastAPI auto-create on startup.

CREATE DATABASE IF NOT EXISTS `rallyos`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `rallyos`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `admin_id` INT NULL,
  `username` VARCHAR(64) NOT NULL,
  `email` VARCHAR(191) NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `job_title` VARCHAR(120) NULL,
  `phone` VARCHAR(40) NULL,
  `hashed_password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'scorekeeper',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_users_username` (`username`),
  KEY `ix_users_admin_id` (`admin_id`),
  KEY `ix_users_email` (`email`),
  KEY `ix_users_role` (`role`),
  CONSTRAINT `fk_users_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `courts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `admin_id` INT NULL,
  `court_number` INT NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `surface_type` VARCHAR(32) NOT NULL DEFAULT 'Indoor',
  `status` VARCHAR(32) NOT NULL DEFAULT 'Available',
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `maintenance_note` TEXT NULL,
  `maintenance_date` VARCHAR(20) NULL,
  `maintenance_start` VARCHAR(10) NULL,
  `maintenance_end` VARCHAR(10) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_courts_admin_id` (`admin_id`),
  KEY `ix_courts_court_number` (`court_number`),
  KEY `ix_courts_status` (`status`),
  CONSTRAINT `fk_courts_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tournaments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `admin_id` INT NULL,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `tournament_type` VARCHAR(64) NOT NULL DEFAULT 'Championship',
  `match_type` VARCHAR(32) NOT NULL DEFAULT 'Doubles',
  `skill_division` VARCHAR(32) NOT NULL DEFAULT '4.0',
  `format` VARCHAR(40) NOT NULL DEFAULT 'Single Elimination',
  `registration_deadline` VARCHAR(20) NOT NULL,
  `start_date` VARCHAR(20) NOT NULL,
  `max_participants` INT NOT NULL DEFAULT 8,
  `entry_fee_info` VARCHAR(64) NULL,
  `assigned_court_ids` JSON NOT NULL,
  `match_format` VARCHAR(32) NOT NULL DEFAULT 'Best of 3',
  `scoring_type` VARCHAR(32) NOT NULL DEFAULT 'Side-Out',
  `points_to_win` INT NOT NULL DEFAULT 11,
  `win_by_two` TINYINT(1) NOT NULL DEFAULT 1,
  `status` VARCHAR(32) NOT NULL DEFAULT 'Registration Open',
  `participants` JSON NOT NULL,
  `matches` JSON NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_tournaments_admin_id` (`admin_id`),
  KEY `ix_tournaments_code` (`code`),
  KEY `ix_tournaments_name` (`name`),
  KEY `ix_tournaments_start_date` (`start_date`),
  KEY `ix_tournaments_status` (`status`),
  CONSTRAINT `fk_tournaments_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `games` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `admin_id` INT NULL,
  `code` VARCHAR(32) NOT NULL,
  `match_type` VARCHAR(32) NOT NULL DEFAULT 'Doubles',
  `team_a_name` VARCHAR(140) NOT NULL,
  `team_a_players` JSON NOT NULL,
  `team_b_name` VARCHAR(140) NOT NULL,
  `team_b_players` JSON NOT NULL,
  `court_id` INT NULL,
  `court_name` VARCHAR(120) NULL,
  `scheduled_date` VARCHAR(20) NOT NULL,
  `start_time` VARCHAR(10) NOT NULL,
  `end_time` VARCHAR(10) NOT NULL,
  `duration_minutes` INT NOT NULL DEFAULT 45,
  `match_format` VARCHAR(32) NOT NULL DEFAULT 'Single Game',
  `scoring_type` VARCHAR(32) NOT NULL DEFAULT 'Side-Out',
  `points_to_win` INT NOT NULL DEFAULT 11,
  `win_by_two` TINYINT(1) NOT NULL DEFAULT 1,
  `score_a` INT NOT NULL DEFAULT 0,
  `score_b` INT NOT NULL DEFAULT 0,
  `games_won_a` INT NOT NULL DEFAULT 0,
  `games_won_b` INT NOT NULL DEFAULT 0,
  `current_game_number` INT NOT NULL DEFAULT 1,
  `set_scores` JSON NOT NULL,
  `serving_team` VARCHAR(8) NOT NULL DEFAULT 'A',
  `server_number` INT NOT NULL DEFAULT 2,
  `status` VARCHAR(32) NOT NULL DEFAULT 'Upcoming',
  `winner_team` VARCHAR(8) NULL,
  `started_at` VARCHAR(40) NULL,
  `completed_at` VARCHAR(40) NULL,
  `tournament_id` INT NULL,
  `tournament_name` VARCHAR(160) NULL,
  `tournament_match_id` VARCHAR(64) NULL,
  `score_events` JSON NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_games_admin_id` (`admin_id`),
  KEY `ix_games_code` (`code`),
  KEY `ix_games_court_id` (`court_id`),
  KEY `ix_games_match_type` (`match_type`),
  KEY `ix_games_scheduled_date` (`scheduled_date`),
  KEY `ix_games_status` (`status`),
  KEY `ix_games_tournament_id` (`tournament_id`),
  CONSTRAINT `fk_games_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_games_court` FOREIGN KEY (`court_id`) REFERENCES `courts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_games_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `platform_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `admin_id` INT NULL,
  `business` JSON NOT NULL,
  `game_defaults` JSON NOT NULL,
  `tournament_defaults` JSON NOT NULL,
  `court_defaults` JSON NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_platform_settings_admin_id` (`admin_id`),
  CONSTRAINT `fk_platform_settings_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Administrator Accounts (password: Admin123!)
INSERT INTO `users` (`admin_id`, `username`, `email`, `full_name`, `job_title`, `hashed_password`, `role`, `is_active`)
VALUES
  (NULL, 'admin', 'admin@rallyos.club', 'Administrator', 'System Administrator', '$2b$12$HGursDQZjqRkrIiXc68h1OfJzkFAM2X3WwFAqSrESQypTMH1bZTdC', 'admin', 1),
  (NULL, 'admin1', 'admin1@rallyos.club', 'Administrator 1', 'Club Administrator', '$2b$12$HGursDQZjqRkrIiXc68h1OfJzkFAM2X3WwFAqSrESQypTMH1bZTdC', 'admin', 1),
  (NULL, 'admin2', 'admin2@rallyos.club', 'Administrator 2', 'Club Administrator', '$2b$12$HGursDQZjqRkrIiXc68h1OfJzkFAM2X3WwFAqSrESQypTMH1bZTdC', 'admin', 1)
ON DUPLICATE KEY UPDATE
  `admin_id` = NULL,
  `role` = 'admin',
  `is_active` = 1;
