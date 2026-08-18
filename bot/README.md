# La Familia Telegram Bot — Vercel

Testowa wersja bota przeznaczona do wdrożenia na Vercel.

## Funkcje

- `/start`, `/catalog`, `/cart`, `/orders`, `/help`
- katalog legalnych produktów
- koszyk
- tworzenie i historia zamówień
- panel administratora `/admin`
- statusy zamówień przez `/status ID STATUS`
- Mini App
- kontakt `@elotonieja`
- Telegram webhook przez `/api/telegram`
- Neon/Postgres do trwałego przechowywania danych

## Vercel

Ustaw w Project Settings → Environment Variables:

- `BOT_TOKEN` — token z BotFather
- `ADMIN_IDS` — numeryczne Telegram ID administratorów
- `WEB_APP_URL` — adres Mini App
- `CONTACT_USERNAME` — bez `@`
- `DATABASE_URL` — połączenie Neon/Postgres
- `SETUP_SECRET` — własny losowy sekret

Po pierwszym Deploy otwórz jednorazowo:

`https://TWOJ-DOMEN/api/setup?secret=TWÓJ_SETUP_SECRET`

Endpoint ustawi webhook Telegrama i komendy bota.

Nie umieszczaj `BOT_TOKEN`, `DATABASE_URL` ani `SETUP_SECRET` w repozytorium.

Katalog zawiera wyłącznie przykładowe legalne produkty.
