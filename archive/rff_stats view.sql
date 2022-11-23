create view rff_stats as
SELECT COUNT(*) AS [total],
    (
        SELECT COUNT(*) AS count
        FROM rff
        WHERE returned = 0
            AND lost_stolen = 0
    ) as [open],
    (
        SELECT COUNT(*) AS count
        FROM rff
        WHERE returned = 1
            OR lost_stolen = 1
    ) as [closed],
    (
        SELECT COUNT(*) AS count
        FROM rff
        WHERE returned = 0
            AND lost_stolen = 0
            AND (
                (
                    snooze_date IS NULL
                    AND added <= DATEADD(day, -14, convert(date, GETDATE()))
                )
                OR (
                    snooze_date IS NOT NULL
                    AND snooze_date <= DATEADD(day, -7, convert(date, GETDATE()))
                )
            )
    ) as [to_call],
    (
        SELECT COUNT(*) AS count
        FROM rff
        WHERE returned = 0
            and lost_stolen = 0
            AND snooze_date IS NOT NULL
    ) as [snoozed],
    (
        SELECT COUNT(*)
        FROM rff
        WHERE returned = 0
            AND lost_stolen = 1
    ) as [lost_stolen],
    (
        SELECT COUNT(DISTINCT branch)
        FROM rff
        WHERE returned = 0
            AND lost_stolen = 0
    ) as [branches],
    (
        SELECT COUNT(DISTINCT user)
        FROM rff
        WHERE returned = 0
            AND lost_stolen = 0
    ) as [users]
FROM rff