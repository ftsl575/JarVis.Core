# JarVis.Core — Status Freeze Snapshot

- **Date:** 2026-01-18
- **Repo:** https://github.com/ftsl575/JarVis.Core
- **Branch:** main

## What is working

- **Repo hygiene:** артефакты рантайма идут в `out/`/`logs/`, git статус чистый.
- **Batch clean (HPE):** пакетная очистка спецификаций в `out/hpe_cleaned/`.
- **Invoice generation (HPE):** генерация `out/hpe_invoice.xlsx` из очищенной спецификации.
- **Deterministic template:** путь к шаблону инвойса определяется (флаг > env > дефолт) и не коммитится.
- **Tests:** базовые проверки проходят на локальной машине при корректной среде.

## Known behavior

- **Factory Integrated**-строки не удаляются автоматически и остаются в данных.

## Local files policy

- Шаблон инвойса — только локальный файл; бинарники (`.xlsx`) в git не добавляются.

## Canonical smoke-check commands (PowerShell)

```powershell
npm ci
npm run docs:hpe:clean
npm run docs:hpe:invoice
```

## Next possible roadmap

- Packing list (черновой экспорт).
- Golden samples (замороженные эталоны вход/выход).
- Опциональное удаление строк **Factory Integrated**.
