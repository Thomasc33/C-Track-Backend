CREATE TABLE [common_parts]
(
 [part_type]    varchar(50) NOT NULL ,
 [manufacturer] varchar(50) NULL ,


 CONSTRAINT [PK_5] PRIMARY KEY CLUSTERED ([part_type] ASC)
);
GO

CREATE TABLE [part_list]
(
 [id]           int IDENTITY (10000, 3) NOT NULL ,
 [part_type]    varchar(50) NOT NULL ,
 [model_number] varchar(50) NOT NULL ,
 [part_number]  varchar(50) NOT NULL ,
 [image]		text NULL,
 [minimum_stock] int NOT NULL,


 CONSTRAINT [PK_9] PRIMARY KEY CLUSTERED ([id] ASC),
 CONSTRAINT [FK_part_type] FOREIGN KEY ([part_type])  REFERENCES [common_parts]([part_type]) ON DELETE NO ACTION ON UPDATE CASCADE,
 CONSTRAINT [FK_pl_model_number] FOREIGN KEY ([model_number])  REFERENCES [models]([model_number]) ON DELETE NO ACTION ON UPDATE CASCADE
);
GO

CREATE TABLE [parts]
(
 [id]       int IDENTITY (10000, 3) NOT NULL ,
 [part_id]  int NOT NULL ,
 [used_by]  int NULL ,
 [location] varchar(50) NULL ,
 [added_by] int NOT NULL ,
 [added_on] datetime NOT NULL ,
 [used_on]  datetime NULL ,


 CONSTRAINT [PK_27] PRIMARY KEY CLUSTERED ([id] ASC),
 CONSTRAINT [FK_parts_partnum] FOREIGN KEY ([part_id])  REFERENCES [part_list]([id]) ON UPDATE CASCADE ON DELETE NO ACTION,
 CONSTRAINT [FK_pl_added_by] FOREIGN KEY ([added_by])  REFERENCES [users]([id]) ON UPDATE CASCADE ON DELETE NO ACTION,
 CONSTRAINT [FK_pl_asset_id] FOREIGN KEY ([location])  REFERENCES [assets]([id]) ON UPDATE NO ACTION ON DELETE NO ACTION,
 CONSTRAINT [FK_pl_used_by] FOREIGN KEY ([used_by])  REFERENCES [users]([id]) ON UPDATE NO ACTION ON DELETE NO ACTION
);
GO

CREATE NONCLUSTERED INDEX [FK_12] ON [part_list] 
 (
  [part_type] ASC
 )

GO

CREATE NONCLUSTERED INDEX [FK_18] ON [part_list] 
 (
  [model_number] ASC
 )

GO

CREATE NONCLUSTERED INDEX [FK_30] ON [parts] 
 (
  [part_id] ASC
 )

GO

CREATE NONCLUSTERED INDEX [FK_33] ON [parts] 
 (
  [added_by] ASC
 )

GO

CREATE NONCLUSTERED INDEX [FK_36] ON [parts] 
 (
  [location] ASC
 )

GO

CREATE NONCLUSTERED INDEX [FK_40] ON [parts] 
 (
  [used_by] ASC
 )

GO

alter table user_permissions
add use_repair_log tinyint default 0 not null,
	view_parts tinyint default 0 not null,
	edit_parts tinyint default 0 not null,
	view_part_types tinyint default 0 not null,
	edit_part_types tinyint default 0 not null,
	view_part_inventory tinyint default 0 not null;
GO

alter table models
add parts_enabled tinyint default 0 not null
GO