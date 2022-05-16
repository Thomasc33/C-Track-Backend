create table notifications (
	[id]			int IDENTITY (10000, 8) NOT NULL ,
	[user_id]		int not null,
	[read]			tinyint not null default 0,
	[archived]		tinyint not null default 0,
	[important]		tinyint not null default 0,
	[title]			varchar(255) null,
	[message]		text null,
	[url]			text null,
	[image]			text null,
	[date]			Datetime default (GETDATE()),


	CONSTRAINT [PK_Noti] PRIMARY KEY CLUSTERED ([id] ASC),
	CONSTRAINT [FK_user_noti] FOREIGN KEY ([user_id]) REFERENCES [users]([id]) ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE NONCLUSTERED INDEX [FK_Noti_index] on [notifications] (
	[id] ASC
);

CREATE NONCLUSTERED INDEX [FK_UID_noti_index] on [notifications] (
	[user_id] ASC
);