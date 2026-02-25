IMAGE := social-media-publisher
COMPOSE := docker compose -f discord-bot/docker-compose.yml

.PHONY: build up down restart logs status clean

build:
	docker build -t $(IMAGE) ./discord-bot

up: build
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart: down up

logs:
	$(COMPOSE) logs -f

status:
	$(COMPOSE) ps
