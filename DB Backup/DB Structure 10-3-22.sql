USE [master]
GO
/****** Object:  Database [Tracker]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE DATABASE [Tracker]
 CONTAINMENT = NONE
 ON  PRIMARY 
( NAME = N'Tracker', FILENAME = N'C:\Program Files\Microsoft SQL Server\MSSQL15.SQLEXPRESS\MSSQL\DATA\Tracker.mdf' , SIZE = 73728KB , MAXSIZE = UNLIMITED, FILEGROWTH = 65536KB )
 LOG ON 
( NAME = N'Tracker_log', FILENAME = N'C:\Program Files\Microsoft SQL Server\MSSQL15.SQLEXPRESS\MSSQL\DATA\Tracker_log.ldf' , SIZE = 204800KB , MAXSIZE = 2048GB , FILEGROWTH = 65536KB )
 WITH CATALOG_COLLATION = DATABASE_DEFAULT
GO
ALTER DATABASE [Tracker] SET COMPATIBILITY_LEVEL = 150
GO
IF (1 = FULLTEXTSERVICEPROPERTY('IsFullTextInstalled'))
begin
EXEC [Tracker].[dbo].[sp_fulltext_database] @action = 'enable'
end
GO
ALTER DATABASE [Tracker] SET ANSI_NULL_DEFAULT OFF 
GO
ALTER DATABASE [Tracker] SET ANSI_NULLS OFF 
GO
ALTER DATABASE [Tracker] SET ANSI_PADDING OFF 
GO
ALTER DATABASE [Tracker] SET ANSI_WARNINGS OFF 
GO
ALTER DATABASE [Tracker] SET ARITHABORT OFF 
GO
ALTER DATABASE [Tracker] SET AUTO_CLOSE OFF 
GO
ALTER DATABASE [Tracker] SET AUTO_SHRINK OFF 
GO
ALTER DATABASE [Tracker] SET AUTO_UPDATE_STATISTICS ON 
GO
ALTER DATABASE [Tracker] SET CURSOR_CLOSE_ON_COMMIT OFF 
GO
ALTER DATABASE [Tracker] SET CURSOR_DEFAULT  GLOBAL 
GO
ALTER DATABASE [Tracker] SET CONCAT_NULL_YIELDS_NULL OFF 
GO
ALTER DATABASE [Tracker] SET NUMERIC_ROUNDABORT OFF 
GO
ALTER DATABASE [Tracker] SET QUOTED_IDENTIFIER OFF 
GO
ALTER DATABASE [Tracker] SET RECURSIVE_TRIGGERS OFF 
GO
ALTER DATABASE [Tracker] SET  DISABLE_BROKER 
GO
ALTER DATABASE [Tracker] SET AUTO_UPDATE_STATISTICS_ASYNC OFF 
GO
ALTER DATABASE [Tracker] SET DATE_CORRELATION_OPTIMIZATION OFF 
GO
ALTER DATABASE [Tracker] SET TRUSTWORTHY OFF 
GO
ALTER DATABASE [Tracker] SET ALLOW_SNAPSHOT_ISOLATION OFF 
GO
ALTER DATABASE [Tracker] SET PARAMETERIZATION SIMPLE 
GO
ALTER DATABASE [Tracker] SET READ_COMMITTED_SNAPSHOT OFF 
GO
ALTER DATABASE [Tracker] SET HONOR_BROKER_PRIORITY OFF 
GO
ALTER DATABASE [Tracker] SET RECOVERY FULL 
GO
ALTER DATABASE [Tracker] SET  MULTI_USER 
GO
ALTER DATABASE [Tracker] SET PAGE_VERIFY CHECKSUM  
GO
ALTER DATABASE [Tracker] SET DB_CHAINING OFF 
GO
ALTER DATABASE [Tracker] SET FILESTREAM( NON_TRANSACTED_ACCESS = OFF ) 
GO
ALTER DATABASE [Tracker] SET TARGET_RECOVERY_TIME = 60 SECONDS 
GO
ALTER DATABASE [Tracker] SET DELAYED_DURABILITY = DISABLED 
GO
ALTER DATABASE [Tracker] SET ACCELERATED_DATABASE_RECOVERY = OFF  
GO
ALTER DATABASE [Tracker] SET QUERY_STORE = OFF
GO
USE [Tracker]
GO
/****** Object:  User [NodeExpress]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE USER [NodeExpress] FOR LOGIN [NodeExpress] WITH DEFAULT_SCHEMA=[dbo]
GO
/****** Object:  User [express]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE USER [express] WITHOUT LOGIN WITH DEFAULT_SCHEMA=[dbo]
GO
/****** Object:  Table [dbo].[assets]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[assets](
	[id] [varchar](50) NOT NULL,
	[status] [int] NOT NULL,
	[model_number] [varchar](50) NOT NULL,
	[return_reason] [text] NULL,
	[notes] [text] NULL,
	[watching] [text] NULL,
	[locked] [tinyint] NULL,
	[company] [varchar](50) NULL,
	[icc_id] [varchar](50) NULL,
	[mobile_number] [varchar](15) NULL,
	[hold_type] [varchar](50) NULL,
	[location] [varchar](15) NOT NULL,
 CONSTRAINT [PK_assets] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = ON, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  View [dbo].[in_house_assets]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
create view [dbo].[in_house_assets] as
select * from assets
where location = 'MDCentric'
GO
/****** Object:  Table [dbo].[jobs]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[jobs](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[job_code] [varchar](50) NOT NULL,
	[is_hourly] [tinyint] NOT NULL,
	[price] [decimal](13, 4) NOT NULL,
	[job_name] [varchar](255) NOT NULL,
	[status_only] [tinyint] NULL,
	[applies] [text] NULL,
	[requires_asset] [tinyint] NULL,
	[hourly_goal] [decimal](13, 4) NULL,
	[restricted_comments] [text] NULL,
	[prompt_count] [tinyint] NULL,
	[snipe_id] [int] NULL,
	[usage_rule_group] [varchar](15) NULL,
 CONSTRAINT [PK_job codes] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  View [dbo].[usable_jobs]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
create view [dbo].[usable_jobs] as
select * from jobs
WHERE status_only IS NULL OR status_only = 0
GO
/****** Object:  View [dbo].[hourly_job_codes]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
create view [dbo].[hourly_job_codes] as
select * from jobs where is_hourly = 1
GO
/****** Object:  View [dbo].[ppd_job_codes]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
create view [dbo].[ppd_job_codes] as
select * from jobs where is_hourly = 0
GO
/****** Object:  Table [dbo].[asset_tracking]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[asset_tracking](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[user_id] [int] NOT NULL,
	[asset_id] [varchar](50) NULL,
	[job_code] [int] NOT NULL,
	[date] [date] NOT NULL,
	[notes] [text] NULL,
	[time] [time](7) NULL,
	[branch] [varchar](15) NULL,
 CONSTRAINT [PK_asset tracking] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[common_parts]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[common_parts](
	[part_type] [varchar](50) NOT NULL,
	[manufacturer] [varchar](50) NULL,
 CONSTRAINT [PK_5] PRIMARY KEY CLUSTERED 
(
	[part_type] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[history]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[history](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[asset_id] [varchar](50) NULL,
	[old_status] [int] NULL,
	[new_status] [int] NULL,
	[user] [int] NOT NULL,
	[time] [datetime] NOT NULL,
	[ip_address] [varchar](255) NULL,
	[route] [varchar](255) NULL,
	[body] [text] NULL,
 CONSTRAINT [PK_history] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[hourly_tracking]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[hourly_tracking](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[job_code] [int] NOT NULL,
	[user_id] [int] NOT NULL,
	[start_time] [time](7) NOT NULL,
	[end_time] [time](7) NOT NULL,
	[notes] [text] NULL,
	[hours] [decimal](4, 2) NULL,
	[date] [date] NOT NULL,
	[in_progress] [tinyint] NULL,
 CONSTRAINT [PK_hourly tracking] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[inventory_history]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[inventory_history](
	[id] [int] IDENTITY(1000,7) NOT NULL,
	[user_id] [int] NOT NULL,
	[timestamp] [datetime] NOT NULL,
	[missing_assets] [text] NULL,
	[wrong_location_assets] [text] NULL,
	[up_to_date_assets] [text] NULL,
	[in_house_not_scanned] [text] NULL,
	[location_changes] [text] NULL,
 CONSTRAINT [PK_id] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[job_price_history]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[job_price_history](
	[job_id] [int] NOT NULL,
	[price] [decimal](13, 4) NOT NULL,
	[from] [date] NOT NULL,
	[to] [date] NULL
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[models]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[models](
	[model_number] [varchar](50) NOT NULL,
	[name] [varchar](50) NOT NULL,
	[category] [varchar](50) NOT NULL,
	[image] [text] NULL,
	[manufacturer] [varchar](50) NOT NULL,
	[parts_enabled] [tinyint] NOT NULL,
 CONSTRAINT [PK_models] PRIMARY KEY CLUSTERED 
(
	[model_number] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[notifications]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[notifications](
	[id] [int] IDENTITY(10000,8) NOT NULL,
	[user_id] [int] NOT NULL,
	[read] [tinyint] NOT NULL,
	[archived] [tinyint] NOT NULL,
	[important] [tinyint] NOT NULL,
	[title] [varchar](255) NULL,
	[message] [text] NULL,
	[url] [text] NULL,
	[image] [text] NULL,
	[date] [datetime] NULL,
	[color] [varchar](11) NULL,
	[read_at] [datetime] NULL,
 CONSTRAINT [PK_Noti] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[part_list]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[part_list](
	[id] [int] IDENTITY(10000,3) NOT NULL,
	[part_type] [varchar](50) NOT NULL,
	[part_number] [varchar](50) NOT NULL,
	[image] [text] NULL,
	[minimum_stock] [int] NOT NULL,
	[models] [text] NOT NULL,
	[watchers] [text] NULL,
 CONSTRAINT [PK_9] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[parts]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[parts](
	[id] [int] IDENTITY(10000,3) NOT NULL,
	[part_id] [int] NOT NULL,
	[used_by] [int] NULL,
	[location] [varchar](50) NULL,
	[added_by] [int] NOT NULL,
	[added_on] [datetime] NOT NULL,
	[used_on] [datetime] NULL,
 CONSTRAINT [PK_27] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[user_permissions]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[user_permissions](
	[id] [int] NOT NULL,
	[view_jobcodes] [tinyint] NOT NULL,
	[edit_jobcodes] [tinyint] NOT NULL,
	[view_users] [tinyint] NOT NULL,
	[edit_users] [tinyint] NOT NULL,
	[use_importer] [tinyint] NOT NULL,
	[view_reports] [tinyint] NOT NULL,
	[view_models] [tinyint] NULL,
	[edit_models] [tinyint] NULL,
	[view_assets] [tinyint] NULL,
	[edit_assets] [tinyint] NULL,
	[use_hourly_tracker] [tinyint] NULL,
	[use_asset_tracker] [tinyint] NULL,
	[edit_others_worksheets] [tinyint] NULL,
	[view_particles] [tinyint] NOT NULL,
	[watch_assets] [tinyint] NULL,
	[use_repair_log] [tinyint] NOT NULL,
	[view_parts] [tinyint] NOT NULL,
	[edit_parts] [tinyint] NOT NULL,
	[view_part_types] [tinyint] NOT NULL,
	[edit_part_types] [tinyint] NOT NULL,
	[view_part_inventory] [tinyint] NOT NULL,
	[use_discrepancy_check] [tinyint] NOT NULL,
	[use_all_discrepancy_check] [tinyint] NOT NULL,
	[use_inventory_scan] [tinyint] NULL,
	[receive_historical_change_notifications] [tinyint] NULL,
 CONSTRAINT [PK_108] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[users]    Script Date: 10/3/2022 9:57:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[users](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[username] [varchar](50) NOT NULL,
	[is_dark_theme] [tinyint] NOT NULL,
	[is_admin] [tinyint] NOT NULL,
	[email] [varchar](50) NOT NULL,
	[title] [varchar](50) NOT NULL,
	[name] [varchar](255) NOT NULL,
	[ts_authorization] [varchar](255) NULL,
	[ts_refresh] [varchar](255) NULL,
	[ts_expires] [datetime] NULL,
	[ts_uid] [varchar](50) NULL,
	[is_archived] [tinyint] NULL,
	[hrly_favorites] [text] NULL,
	[asset_favorites] [text] NULL,
 CONSTRAINT [PK_users] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY],
 CONSTRAINT [UK_email] UNIQUE NONCLUSTERED 
(
	[email] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_61]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_61] ON [dbo].[asset_tracking]
(
	[job_code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
/****** Object:  Index [fkIdx_66]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_66] ON [dbo].[asset_tracking]
(
	[asset_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_70]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_70] ON [dbo].[asset_tracking]
(
	[user_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
/****** Object:  Index [fkIdx_19]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_19] ON [dbo].[assets]
(
	[model_number] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_26]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_26] ON [dbo].[assets]
(
	[status] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_43]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_43] ON [dbo].[history]
(
	[user] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_46]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_46] ON [dbo].[history]
(
	[new_status] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_49]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_49] ON [dbo].[history]
(
	[old_status] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
/****** Object:  Index [fkIdx_57]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_57] ON [dbo].[history]
(
	[asset_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_73]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_73] ON [dbo].[hourly_tracking]
(
	[user_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_77]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_77] ON [dbo].[hourly_tracking]
(
	[job_code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fk_44]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fk_44] ON [dbo].[job_price_history]
(
	[job_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [FK_Noti_index]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [FK_Noti_index] ON [dbo].[notifications]
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [FK_UID_noti_index]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [FK_UID_noti_index] ON [dbo].[notifications]
(
	[user_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
/****** Object:  Index [FK_12]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [FK_12] ON [dbo].[part_list]
(
	[part_type] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [FK_30]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [FK_30] ON [dbo].[parts]
(
	[part_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [FK_33]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [FK_33] ON [dbo].[parts]
(
	[added_by] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
/****** Object:  Index [FK_36]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [FK_36] ON [dbo].[parts]
(
	[location] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [FK_40]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [FK_40] ON [dbo].[parts]
(
	[used_by] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [fkIdx_107]    Script Date: 10/3/2022 9:57:02 AM ******/
CREATE NONCLUSTERED INDEX [fkIdx_107] ON [dbo].[user_permissions]
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
ALTER TABLE [dbo].[assets] ADD  DEFAULT ((0)) FOR [locked]
GO
ALTER TABLE [dbo].[assets] ADD  DEFAULT ('CURO') FOR [company]
GO
ALTER TABLE [dbo].[assets] ADD  CONSTRAINT [df_location]  DEFAULT ('Unknown') FOR [location]
GO
ALTER TABLE [dbo].[jobs] ADD  DEFAULT ((0)) FOR [status_only]
GO
ALTER TABLE [dbo].[jobs] ADD  DEFAULT ((1)) FOR [requires_asset]
GO
ALTER TABLE [dbo].[jobs] ADD  DEFAULT ((0)) FOR [prompt_count]
GO
ALTER TABLE [dbo].[models] ADD  DEFAULT ((0)) FOR [parts_enabled]
GO
ALTER TABLE [dbo].[notifications] ADD  DEFAULT ((0)) FOR [read]
GO
ALTER TABLE [dbo].[notifications] ADD  DEFAULT ((0)) FOR [archived]
GO
ALTER TABLE [dbo].[notifications] ADD  DEFAULT ((0)) FOR [important]
GO
ALTER TABLE [dbo].[notifications] ADD  DEFAULT (getdate()) FOR [date]
GO
ALTER TABLE [dbo].[notifications] ADD  DEFAULT (NULL) FOR [read_at]
GO
ALTER TABLE [dbo].[part_list] ADD  DEFAULT ((0)) FOR [minimum_stock]
GO
ALTER TABLE [dbo].[user_permissions] ADD  CONSTRAINT [DF_user_permissions_view_jobcodes]  DEFAULT ((0)) FOR [view_jobcodes]
GO
ALTER TABLE [dbo].[user_permissions] ADD  CONSTRAINT [DF_user_permissions_edit_jobcodes]  DEFAULT ((0)) FOR [edit_jobcodes]
GO
ALTER TABLE [dbo].[user_permissions] ADD  CONSTRAINT [DF_user_permissions_view_users]  DEFAULT ((0)) FOR [view_users]
GO
ALTER TABLE [dbo].[user_permissions] ADD  CONSTRAINT [DF_user_permissions_edit_users]  DEFAULT ((0)) FOR [edit_users]
GO
ALTER TABLE [dbo].[user_permissions] ADD  CONSTRAINT [DF_user_permissions_use_importer]  DEFAULT ((0)) FOR [use_importer]
GO
ALTER TABLE [dbo].[user_permissions] ADD  CONSTRAINT [DF_user_permissions_view_reports]  DEFAULT ((0)) FOR [view_reports]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [view_models]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [edit_models]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [view_assets]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [edit_assets]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((1)) FOR [use_hourly_tracker]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((1)) FOR [use_asset_tracker]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [edit_others_worksheets]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [view_particles]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [watch_assets]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [use_repair_log]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [view_parts]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [edit_parts]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [view_part_types]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [edit_part_types]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [view_part_inventory]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((1)) FOR [use_discrepancy_check]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [use_all_discrepancy_check]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [use_inventory_scan]
GO
ALTER TABLE [dbo].[user_permissions] ADD  DEFAULT ((0)) FOR [receive_historical_change_notifications]
GO
ALTER TABLE [dbo].[users] ADD  CONSTRAINT [DF_Users_is_dark_theme]  DEFAULT ((1)) FOR [is_dark_theme]
GO
ALTER TABLE [dbo].[users] ADD  CONSTRAINT [DF_Users_is_admin]  DEFAULT ((0)) FOR [is_admin]
GO
ALTER TABLE [dbo].[users] ADD  DEFAULT ((0)) FOR [is_archived]
GO
ALTER TABLE [dbo].[asset_tracking]  WITH CHECK ADD  CONSTRAINT [FK_asset_id] FOREIGN KEY([asset_id])
REFERENCES [dbo].[assets] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[asset_tracking] CHECK CONSTRAINT [FK_asset_id]
GO
ALTER TABLE [dbo].[asset_tracking]  WITH CHECK ADD  CONSTRAINT [FK_job_code] FOREIGN KEY([job_code])
REFERENCES [dbo].[jobs] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[asset_tracking] CHECK CONSTRAINT [FK_job_code]
GO
ALTER TABLE [dbo].[asset_tracking]  WITH CHECK ADD  CONSTRAINT [FK_user_id] FOREIGN KEY([user_id])
REFERENCES [dbo].[users] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[asset_tracking] CHECK CONSTRAINT [FK_user_id]
GO
ALTER TABLE [dbo].[assets]  WITH CHECK ADD  CONSTRAINT [FK_model_number] FOREIGN KEY([model_number])
REFERENCES [dbo].[models] ([model_number])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[assets] CHECK CONSTRAINT [FK_model_number]
GO
ALTER TABLE [dbo].[assets]  WITH CHECK ADD  CONSTRAINT [FK_status] FOREIGN KEY([status])
REFERENCES [dbo].[jobs] ([id])
GO
ALTER TABLE [dbo].[assets] CHECK CONSTRAINT [FK_status]
GO
ALTER TABLE [dbo].[history]  WITH CHECK ADD  CONSTRAINT [FK_h_asset_id] FOREIGN KEY([asset_id])
REFERENCES [dbo].[assets] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[history] CHECK CONSTRAINT [FK_h_asset_id]
GO
ALTER TABLE [dbo].[history]  WITH CHECK ADD  CONSTRAINT [FK_h_new_status] FOREIGN KEY([new_status])
REFERENCES [dbo].[jobs] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[history] CHECK CONSTRAINT [FK_h_new_status]
GO
ALTER TABLE [dbo].[history]  WITH CHECK ADD  CONSTRAINT [FK_h_old_status] FOREIGN KEY([old_status])
REFERENCES [dbo].[jobs] ([id])
GO
ALTER TABLE [dbo].[history] CHECK CONSTRAINT [FK_h_old_status]
GO
ALTER TABLE [dbo].[history]  WITH CHECK ADD  CONSTRAINT [FK_h_user_id] FOREIGN KEY([user])
REFERENCES [dbo].[users] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[history] CHECK CONSTRAINT [FK_h_user_id]
GO
ALTER TABLE [dbo].[hourly_tracking]  WITH CHECK ADD  CONSTRAINT [FK_hrly_job_code] FOREIGN KEY([job_code])
REFERENCES [dbo].[jobs] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[hourly_tracking] CHECK CONSTRAINT [FK_hrly_job_code]
GO
ALTER TABLE [dbo].[hourly_tracking]  WITH CHECK ADD  CONSTRAINT [FK_hrly_user_id] FOREIGN KEY([user_id])
REFERENCES [dbo].[users] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[hourly_tracking] CHECK CONSTRAINT [FK_hrly_user_id]
GO
ALTER TABLE [dbo].[inventory_history]  WITH CHECK ADD  CONSTRAINT [FK_inventory_history_user_id] FOREIGN KEY([user_id])
REFERENCES [dbo].[users] ([id])
GO
ALTER TABLE [dbo].[inventory_history] CHECK CONSTRAINT [FK_inventory_history_user_id]
GO
ALTER TABLE [dbo].[job_price_history]  WITH CHECK ADD  CONSTRAINT [job_history_fk] FOREIGN KEY([job_id])
REFERENCES [dbo].[jobs] ([id])
ON UPDATE CASCADE
ON DELETE CASCADE
GO
ALTER TABLE [dbo].[job_price_history] CHECK CONSTRAINT [job_history_fk]
GO
ALTER TABLE [dbo].[notifications]  WITH CHECK ADD  CONSTRAINT [FK_user_noti] FOREIGN KEY([user_id])
REFERENCES [dbo].[users] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[notifications] CHECK CONSTRAINT [FK_user_noti]
GO
ALTER TABLE [dbo].[part_list]  WITH CHECK ADD FOREIGN KEY([part_type])
REFERENCES [dbo].[common_parts] ([part_type])
GO
ALTER TABLE [dbo].[parts]  WITH CHECK ADD  CONSTRAINT [FK_parts_partnum] FOREIGN KEY([part_id])
REFERENCES [dbo].[part_list] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[parts] CHECK CONSTRAINT [FK_parts_partnum]
GO
ALTER TABLE [dbo].[parts]  WITH CHECK ADD  CONSTRAINT [FK_pl_added_by] FOREIGN KEY([added_by])
REFERENCES [dbo].[users] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[parts] CHECK CONSTRAINT [FK_pl_added_by]
GO
ALTER TABLE [dbo].[parts]  WITH CHECK ADD  CONSTRAINT [FK_pl_asset_id] FOREIGN KEY([location])
REFERENCES [dbo].[assets] ([id])
GO
ALTER TABLE [dbo].[parts] CHECK CONSTRAINT [FK_pl_asset_id]
GO
ALTER TABLE [dbo].[parts]  WITH CHECK ADD  CONSTRAINT [FK_pl_used_by] FOREIGN KEY([used_by])
REFERENCES [dbo].[users] ([id])
GO
ALTER TABLE [dbo].[parts] CHECK CONSTRAINT [FK_pl_used_by]
GO
ALTER TABLE [dbo].[user_permissions]  WITH CHECK ADD  CONSTRAINT [FK_u_id] FOREIGN KEY([id])
REFERENCES [dbo].[users] ([id])
ON UPDATE CASCADE
GO
ALTER TABLE [dbo].[user_permissions] CHECK CONSTRAINT [FK_u_id]
GO
USE [master]
GO
ALTER DATABASE [Tracker] SET  READ_WRITE 
GO
