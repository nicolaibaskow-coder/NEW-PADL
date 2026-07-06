# PADL Telegram Bot

Trigger.dev scheduled task `padl-monitor` раз в минуту делает один короткий run: читает Telegram updates, обновляет подписчиков, получает слоты ПАДЛ, рассылает текущее состояние и сохраняет metadata в Trigger.dev Session.

## Команды

```bash
npm run verify
npm run dry-run
npm run trigger:dev
npm run trigger:deploy
```

## Env

Скопируйте `.env.example` в `.env` и задайте реальные `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY` и `TELEGRAM_BOT_TOKEN`.
`TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS` должен быть `0` для production.

## Ограничения

В проекте нет внешней базы данных, webhook-сервера, daemon-процесса, бесконечного Telegram polling-loop и self-trigger расписания. Повторный запуск выполняется только Trigger.dev cron schedule.
