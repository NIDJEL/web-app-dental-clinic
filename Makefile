include .env
export

.DEFAULT_GOAL := help

COMPOSE=docker compose

POSTGRES_CONTAINER=dental-postgres
MIGRATE_SERVICE=postgres-migrate
MIGRATIONS_PATH=/migrations
DATABASE_URL=postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@postgres:5432/$(POSTGRES_DB)?sslmode=disable

BACKEND_DIR=backend
FRONTEND_DIR=frontend


help:
	@echo "Доступные команды:"
	@echo ""
	@echo "Окружение:"
	@echo "  make env-up              Запустить контейнеры"
	@echo "  make env-down            Остановить контейнеры"
	@echo "  make env-restart         Перезапустить контейнеры"
	@echo "  make env-ps              Показать контейнеры"
	@echo "  make env-logs            Показать все логи"
	@echo "  make logs-postgres       Логи PostgreSQL"
	@echo "  make logs-redis          Логи Redis"
	@echo "  make logs-pgadmin        Логи pgAdmin"
	@echo ""
	@echo "PostgreSQL:"
	@echo "  make db-shell            Открыть консоль PostgreSQL"
	@echo "  make db-tables           Показать таблицы"
	@echo "  make db-users            Показать пользователей"
	@echo "  make db-services         Показать услуги"
	@echo "  make db-appointments     Показать записи"
	@echo "  make db-backup           Сделать backup базы"
	@echo "  make db-restore          Восстановить backup базы"
	@echo ""
	@echo "Миграции:"
	@echo "  make migrate-create seq=init        Создать новую миграцию"
	@echo "  make migrate-up                     Накатить все миграции"
	@echo "  make migrate-down                   Откатить последнюю миграцию"
	@echo "  make migrate-version                Показать версию миграций"
	@echo "  make migrate-force version=1        Принудительно выставить версию"
	@echo ""
	@echo "Seed-файлы:"
	@echo "  make seed-new name=base_data        Создать seed-файл"
	@echo "  make seed-all                       Применить все seed-файлы"
	@echo ""
	@echo "Backend:"
	@echo "  make backend-run        Запустить backend"
	@echo "  make backend-tidy       Обновить зависимости Go"
	@echo "  make backend-test       Запустить тесты backend"
	@echo ""
	@echo "Frontend:"
	@echo "  make frontend-install   Установить зависимости frontend"
	@echo "  make frontend-run       Запустить frontend"
	@echo "  make frontend-build     Собрать frontend"


env-up:
	@$(COMPOSE) up -d

env-down:
	@$(COMPOSE) down

env-restart:
	@$(COMPOSE) down
	@$(COMPOSE) up -d

env-ps:
	@$(COMPOSE) ps

env-logs:
	@$(COMPOSE) logs -f

logs-postgres:
	@$(COMPOSE) logs -f postgres

logs-redis:
	@$(COMPOSE) logs -f redis

logs-pgadmin:
	@$(COMPOSE) logs -f pgadmin


db-shell:
	@docker exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

db-tables:
	@docker exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c "\dt dental_clinic.*"

db-users:
	@docker exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c "SELECT id, login, role_id, employee_id, patient_id, is_active, created_at FROM dental_clinic.users;"

db-services:
	@docker exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c "SELECT id, name, price, duration_minutes, is_active FROM dental_clinic.services;"

db-appointments:
	@docker exec -it $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c "SELECT id, patient_id, doctor_id, service_id, appointment_start, appointment_end, status FROM dental_clinic.appointments;"

db-backup:
	@docker exec $(POSTGRES_CONTAINER) pg_dump -U $(POSTGRES_USER) $(POSTGRES_DB) > database/backups/dental_backup.sql
	@echo "Backup создан: database/backups/dental_backup.sql"

db-restore:
	@docker exec -i $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) < database/backups/dental_backup.sql
	@echo "Backup восстановлен"


migrate-create:
	$(if $(seq),,$(error Укажи имя миграции: make migrate-create seq=init))
	@$(COMPOSE) run --rm $(MIGRATE_SERVICE) create -ext sql -dir $(MIGRATIONS_PATH) -seq $(seq)

migrate-up:
	@$(COMPOSE) run --rm $(MIGRATE_SERVICE) -path $(MIGRATIONS_PATH) -database "$(DATABASE_URL)" up

migrate-down:
	@$(COMPOSE) run --rm $(MIGRATE_SERVICE) -path $(MIGRATIONS_PATH) -database "$(DATABASE_URL)" down 1

migrate-version:
	@$(COMPOSE) run --rm $(MIGRATE_SERVICE) -path $(MIGRATIONS_PATH) -database "$(DATABASE_URL)" version

migrate-force:
	$(if $(version),,$(error Укажи версию: make migrate-force version=1))
	@$(COMPOSE) run --rm $(MIGRATE_SERVICE) -path $(MIGRATIONS_PATH) -database "$(DATABASE_URL)" force $(version)


seed-new:
	$(if $(name),,$(error Укажи имя seed-файла: make seed-new name=base_data))
	@mkdir -p database/seeds
	@last=$$(find database/seeds -maxdepth 1 -type f -name "*.sql" -printf "%f\n" | sed -E 's/^([0-9]+).*/\1/' | sort -n | tail -1); \
	if [ -z "$$last" ]; then \
		next=1; \
	else \
		clear_number=$$(echo $$last | sed 's/^0*//'); \
		if [ -z "$$clear_number" ]; then clear_number=0; fi; \
		next=$$((clear_number + 1)); \
	fi; \
	number=$$(printf "%03d" $$next); \
	file="database/seeds/$${number}_$(name).sql"; \
	touch "$$file"; \
	echo "Создан seed-файл: $$file"

seed-all:
	@if [ ! -d database/seeds ]; then \
		echo "Папка database/seeds не найдена"; \
		exit 0; \
	fi
	@files=$$(find database/seeds -maxdepth 1 -type f -name "*.sql" | sort); \
	if [ -z "$$files" ]; then \
		echo "Seed-файлы не найдены"; \
		exit 0; \
	fi; \
	for file in $$files; do \
		echo "Применяется seed: $$file"; \
		docker exec -i $(POSTGRES_CONTAINER) psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) < $$file; \
	done

backend-run:
	@cd $(BACKEND_DIR) && go run ./cmd/app

backend-tidy:
	@cd $(BACKEND_DIR) && go mod tidy

backend-test:
	@cd $(BACKEND_DIR) && go test ./...


frontend-install:
	@cd $(FRONTEND_DIR) && npm install

frontend-run:
	@cd $(FRONTEND_DIR) && npm run dev

frontend-build:
	@cd $(FRONTEND_DIR) && npm run build